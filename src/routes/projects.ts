import { Project } from '../entity/Project';
import { File } from '../entity/File';
import { getDataSource } from '../database';
import { User } from '../entity/User';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { expressjwt, Params, Request as JWTRequest } from "express-jwt";
import { ProjectSettings } from '../components/javascriv-types/Project/ProjectTypes';
import { areObjectsEqual, buildHierarchicalFiles, saveFile } from './helpers';
import { QueryFailedError } from 'typeorm';
import { flattenProjectFiles, sortFilesByDepth } from './helpers/ProjectUtil';

const jwtProps:Params = { secret: process.env.SECRET_KEY as string, algorithms: ["HS256"] };

const router = Router();

export type ProjectTreeFile = File & { children?: ProjectTreeFile[] };

type ProjectFile = ProjectTreeFile & { changed?: boolean; children?: ProjectFile[] };

interface CreateProjectRequest {
  title: string;
  settings: { [key:string]: string | number | null };
  openFilePath: string;
  files: ProjectFile[];
  creator: number;
}

interface UpdateProjectRequest extends CreateProjectRequest { }

router.post('/project', expressjwt(jwtProps), async (req: JWTRequest, res) => {
  const { title, settings, openFilePath, files, creator: creatorId } = req.body as CreateProjectRequest;

  const token = req.headers.authorization?.replace('Bearer ', '');

  let decoded;

  try {
    decoded = jwt.verify(token || '', process.env.SECRET_KEY || ''); 
  } catch (err) {
    return res.status(401).send('Invalid token');
  }

  if (!title || !settings || !openFilePath || !files || !creatorId) {
    return res.status(400).send('Missing required project data');
  }

  // Get the User, Project and File Repositories from the DataSource
  const dataSource = await getDataSource();
  const userRepository = dataSource.getRepository(User);
  const projectRepository = dataSource.getRepository(Project);
  const fileRepository = dataSource.getRepository(File);

  const userProps = { where: { id: creatorId } };

  const existingUser = await userRepository.findOne(userProps);

  if (!existingUser) {
    return res.status(404).send('User not found');
  }

  const project = new Project();

  project.title = title;
  project.settings = (settings || {}) as ProjectSettings;
  project.openFilePath = openFilePath;
  project.creator = existingUser;
  project.lastEditor = existingUser;
  project.lastEdited = new Date();
  project.collaborators = [];

  await projectRepository.save(project);

  project.files = [];

  const newFiles:ProjectTreeFile[] = [];

  for (const file of files) {
    const newFile = await saveFile(file, undefined, project, fileRepository, existingUser);
    newFiles.push(newFile);
  }

  const savedProject = await loadProject(project.id);

  return res.status(201).json(savedProject);
});

export type FilesByDepth = ProjectFile[][];

router.get('/user/projects', expressjwt(jwtProps), async (req: JWTRequest, res) => {
  const userId = req.auth?.id;

  // Get the Project Repository from the DataSource
  const dataSource = await getDataSource();
  const projectRepository = dataSource.getRepository(Project);
  const userRepository = dataSource.getRepository(User);

  const user = await userRepository.findOne({ where: { id: userId } });

  if (!user) {
    return res.status(404).send('User not found');
  }

  const createdProjects = await projectRepository.find({ 
    where: { creator: user },
    relations: ["creator", "lastEditor"],
    select: ["id", "title", "lastEdited", "lastEditor"]
  });

  const collaboratorProjects = await projectRepository.createQueryBuilder("project")
    .innerJoinAndSelect("project.collaborators", "user", "user.id = :uid", { uid: req.auth?.id })
    .select(["project.id", "project.title"])
    .getMany();

    return res.status(200).json({ createdProjects, collaboratorProjects });
});

router.patch('/project/:id', expressjwt(jwtProps), async (req: JWTRequest, res) => {
  try {
    const dataSource = await getDataSource();

    const projectId = parseInt(req.params.id);

    // Ensure that the project ID is a number
    if (isNaN(projectId)) {
      return res.status(400).send('Invalid project ID');
    }
  
    // Get the various specifics from the request body
    const { title, settings, openFilePath, files } = req.body as UpdateProjectRequest;

    // Instantiate a stand-in project object and populate it with the existing project's data
    // If the project is not found, then the stand-in project will be returned
    let project:Project = new Project();
  
    // Start a transaction
    await dataSource.manager.transaction(async transactionalEntityManager => {
      // Check if the user is either the creator or a collaborator
      const user = await transactionalEntityManager.findOne(User, { where: { id: req.auth?.id } });
    
      // Find the existing project to be updated
      const activeProject = await transactionalEntityManager.findOne(Project, {
        where: { id: projectId },
        relations: ["files", "collaborators", "creator"],
      });
  
      if (!activeProject) {
        throw new Error('Project not found');
      }

      // Set the project (the object we return at the end) to be updated
      project = activeProject;
      if (!user || user.id !== project.creator.id && !project.collaborators?.map(user => user.id).includes(req.auth?.id)) {
        throw new Error('Unauthorized');
      }

      project.lastEdited = new Date();
      project.lastEditor = user;

      const { files: existingFiles } = project;
  
      // flatten the `files` variable into a non-nested object
      // It will start as an array of root-level files, which may have children files

      const filesByDepth = sortFilesByDepth(files);
      const flatFiles = flattenProjectFiles(project, files);

      // Check if any files have been deleted
      const deletedFiles = existingFiles.filter(file => (!file || !flatFiles[file.id]));
  
      // Delete any files that have been removed
      for (const file of deletedFiles) {
        await transactionalEntityManager.remove(File, [file]);
      }

      let fileDepth = 0;

      // Iterate over each filesByDepth level and check if its files have changed
      for (const depthFiles of filesByDepth) {
        // Iterate over each file in the current depth level
        fileDepth = fileDepth + 1;

        for (const file of depthFiles) {
          const existingFile = existingFiles.find(f => (f && file && f.id === file.id));

          if (existingFile) {
            // The file already exists, so check if it has changed
            if (fileDepth === 1 && existingFile.parent) {
              existingFile.parent = null;
            }
  
            if (
              existingFile.content !== file.content ||
              existingFile.name !== file.name ||
              existingFile.path !== file.path ||
              existingFile.parent !== file.parent
            ) {
              // The file has changed, so update it
              existingFile.content = file.content;
              existingFile.name = file.name;
              existingFile.path = file.path;
              existingFile.parent = file.parent;
              existingFile.lastEdited = new Date();
              existingFile.lastEditor = user;
              existingFile.project = project;

              if (!existingFile.parent) {
                // Find the parent file in flatFiles by path
                const parentFile = Object.values(flatFiles).find(f => f.path === file.path.split('/').slice(0, -1).join('/'));
                existingFile.parent = parentFile;
              }
              
              await transactionalEntityManager.save(File, file);
            }
          } else {
            // The file does not exist, so create it

            // If the file has no parent, find it in flatFiles by path
            if (!file.parent) {
              const parentFile = Object.values(flatFiles).find(f => f.path === file.path.split('/').slice(0, -1).join('/'));
              file.parent = parentFile;
            }
            
            if (!file.project) {
              file.project = project;
            }

            if (!file.creator) {
              file.creator = user;
            }

            const savedFile = await saveFile(file, file.parent, file.project, transactionalEntityManager.getRepository(File), user);
            flatFiles[savedFile.id] = savedFile;
          }
        }
      };

      if (!title || !settings || !openFilePath || !files) {
        throw new Error('Missing required project data');
      }
  
      // Update the project details
      project.title = title;

      // If the settings have changed, update them
      if (!areObjectsEqual(project.settings, settings)) {
        project.settings = (settings || {}) as ProjectSettings;
      }
  
      // Set the open file path
      project.openFilePath = openFilePath;
  
      // Set the files
      project.files = flatFiles ? Object.values(flatFiles) : [];

      // Save the updated project
      await transactionalEntityManager.save(Project, project);
    });

    // Load a copy of the saved project from the database and return it
    if (project) {
      const savedProject = await loadProject(project.id);
      return res.status(200).json(savedProject);
    }

    return res.status(200).send(project);
  } catch (error) {
    if (error instanceof QueryFailedError) {
      return res.status(500).send(`Database Query Failed: ${error.message}`);
    } else if (error instanceof Error) {
      return res.status(400).send(error.message);
    }

    return res.status(500).send('Something went wrong');
  }
});

router.patch('/project/:id/collaborator', expressjwt(jwtProps), async (req: JWTRequest, res) => {
  const { search } = req.body;
  const projectId = req.params.id;

  // Ensure search text was provided
  if (!search) {
    return res.status(400).send('Search text is required');
  }

  const dataSource = await getDataSource();
  const userRepository = dataSource.getRepository(User);
  const projectRepository = dataSource.getRepository(Project);

  // Determine if search text is a username or email
  const isEmail = search.includes('@');

  // Find the user to be added as a collaborator
  const userToBeAdded = isEmail 
    ? await userRepository.findOne({ where: { email: search } })
    : await userRepository.findOne({ where: { username: search } });

  if (!userToBeAdded) {
    return res.status(404).send(`User not found (${search})`);
  }

  // Find the project with necessary relations
  const project = await projectRepository.findOne({
    where: { id: parseInt(projectId, 10) },
    relations: ["collaborators", "creator"]
  });

  if (!project) {
    return res.status(404).send('Project not found');
  }

  // Authorization: Ensure the requesting user is the creator
  if (req.auth?.id !== project.creator.id) {
    return res.status(403).send('Unauthorized');
  }

  // Check if the user is already a collaborator
  if (project.collaborators && project.collaborators.some(collaborator => collaborator.id === userToBeAdded.id)) {
    return res.status(409).send('User is already a collaborator');
  }

  // Add the user as a collaborator
  if (!project.collaborators) {
    project.collaborators = [];
  }

  project.collaborators.push(userToBeAdded);

  // Save the updated project
  await projectRepository.save(project);

  return res.status(200).send({ success: project });
});

// Remove a collaborator
router.delete('/project/:id/collaborator/:collaboratorId', expressjwt(jwtProps), async (req: JWTRequest, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const collaboratorId = parseInt(req.params.collaboratorId, 10);

    const dataSource = await getDataSource();
    const projectRepository = dataSource.getRepository(Project);

    const project = await projectRepository.findOne({
      where: { id: projectId },
      relations: ["collaborators", "creator"]
    });

    if (!project) {
      return res.status(404).send('Project not found');
    }

    // Authorization: Ensure the requesting user is the creator of the project,
    // or the collaborator themselves, opting to leave the project.

    if (req.auth?.id !== project.creator.id && req.auth?.id !== collaboratorId) {
      return res.status(403).send('Unauthorized');
    }

    const userRepository = dataSource.getRepository(User);
    const collaborator = await userRepository.findOne({ where: { id: collaboratorId } });

    if (!collaborator) {
      return res.status(404).send('Collaborator user not found.');
    }

    if (!project.collaborators || !project.collaborators.some(user => user.id === collaboratorId)) {
      return res.status(404).send('Collaborator not found on this project.');
    }

    // Remove the collaborator
    project.collaborators = project.collaborators.filter(user => user.id !== collaboratorId);

    await projectRepository.save(project);

    res.json({ success: 'Collaborator removed successfully' });
  } catch (error) {
    console.error('Error removing collaborator:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete a project
router.delete('/project/:id', expressjwt(jwtProps), async (req: JWTRequest, res) => {
  const projectId = parseInt(req.params.id);

  const user = req.auth;

  const dataSource = await getDataSource();
  const projectRepository = dataSource.getRepository(Project);

  const project = await projectRepository.findOne({ 
    where: { id: projectId },
    relations: ["files", "files.parent", "files.creator", "files.editing", "files.lastEditor", "collaborators", "creator"]
  });

  // Check if the project exists
  if (!project) {
    return res.status(404).send('Project not found');
  }

  // Check if the user is the creator
  if (!user || user?.id !== project?.creator.id) {
    return res.status(403).send('Unauthorized');
  }

  // Delete the project and related files
  try {
    // Delete all project files
    await dataSource.manager.remove(File, project.files);
    await projectRepository.remove(project);
    return res.status(200).send('Project deleted');
  } catch (error) {
    return res.status(500).send('An error occurred.');
  }

});

const loadProject = async (projectId:number) => {
  // Get the Project Repository from the DataSource
  const dataSource = await getDataSource();
  const projectRepository = dataSource.getRepository(Project);

  const project = await projectRepository.findOne({ 
    where: { id: projectId },
    relations: ["files", "files.parent", "files.creator", "files.editing", "files.lastEditor", "collaborators", "creator"]
  });

  if (!project) {
    return null;
  }

  // Replace the flat file array with our newly built hierarchical structure
  const projectFiles = buildHierarchicalFiles(project.files);

  return {...project, files: projectFiles};
};

router.post('/project/:id/duplicate', expressjwt(jwtProps), async (req: JWTRequest, res) => {
  const projectId = parseInt(req.params.id);

  // Ensure that the project ID is a number
  if (isNaN(projectId)) {
    return res.status(400).send('Invalid project ID');
  }

  // Get the Project Repository from the DataSource and find the project
  const dataSource = await getDataSource();
  const projectRepository = dataSource.getRepository(Project);
  const project = await projectRepository.findOne({
    where: { id: projectId },
    relations: ["creator", "lastEditor", "collaborators"]
  });

  // Check if the project exists
  if (!project) {
    return res.status(404).send('Project not found');
  }

  // Check if the user is the creator
  if (!req.auth || req.auth?.id !== project.creator.id) {
    return res.status(403).send('Unauthorized');
  }

  try {
    // Create a new project
    const newProject = new Project();
    newProject.title = req.body.title || `Dupe of ${project.title}`;
    newProject.settings = project.settings;
    newProject.openFilePath = project.openFilePath;
    newProject.creator = project.creator;
    newProject.lastEditor = project.creator;
    newProject.lastEdited = new Date();
    newProject.collaborators = project.collaborators || [];

    const newFiles:ProjectTreeFile[] = [];

    // Save the new project
    await projectRepository.save(newProject);

    for (const file of (req.body.files || [])) {
      const fileRepo = dataSource.getRepository(File);
      let { id: originalId, ...copyFile } = file;
      copyFile.parent = null;
      const newFile = await saveFile(copyFile as ProjectTreeFile, undefined, newProject, fileRepo, project.creator, true);
      newFiles.push(newFile);
    }

    return res.status(200).send(newProject);
  } catch (error) {
    return res.status(500).send('An error occurred.');
  }
});

router.patch('/project/:id/rename', expressjwt(jwtProps), async (req: JWTRequest, res) => {
  const projectId = parseInt(req.params.id);

  // Ensure that the project ID is a number
  if (isNaN(projectId)) {
    return res.status(400).send('Invalid project ID');
  }

  // Get the Project Repository from the DataSource and find the project
  const dataSource = await getDataSource();
  const projectRepository = dataSource.getRepository(Project);
  const project = await projectRepository.findOne({
    where: { id: projectId },
    relations: ["creator"]
  });

  const newTitle = req.body.title;

  // Check that a new title was provided.
  if (!newTitle) {
    return res.status(400).send('Title is required');
  }

  // Check if the project exists
  if (!project) {
    return res.status(404).send('Project not found');
  }

  // Check if the user is the creator
  if (!req.auth || req.auth?.id !== project.creator.id) {
    return res.status(403).send('Unauthorized');
  }

  try {
    // Save the renamed project
    project.title = newTitle;
    project.lastEdited = new Date();
    project.lastEditor = project.creator;

    await projectRepository.save(project);

    return res.status(200).send(project);
  } catch (error) {
    return res.status(500).send('An error occurred.');
  }
});

router.get('/project/:id', expressjwt(jwtProps), async (req: JWTRequest, res) => {
  const projectId = parseInt(req.params.id);

  // Ensure that the project ID is a number
  if (isNaN(projectId)) {
    return res.status(400).send('Invalid project ID');
  }

  // Get the Project Repository from the DataSource
  const project = await loadProject(projectId);

  // Check if the project exists
  if (!project) {
    return res.status(404).send('Project not found');
  }

  // Check if the user is either the creator or a collaborator
  if (req.auth?.id !== project.creator.id && !project.collaborators?.map(user => user.id).includes(req.auth?.id)) {
    return res.status(403).send('Unauthorized');
  }

  // Return the project
  return res.status(200).json(project);
});

export default router;