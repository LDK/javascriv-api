import { Project } from '../entity/Project';
import { File } from '../entity/File';
import { getDataSource } from '../database';
import { User } from '../entity/User';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { expressjwt, Params, Request as JWTRequest } from "express-jwt";
import { ProjectSettings } from '../components/javascriv-types/Project/ProjectTypes';
import { areObjectsEqual, buildHierarchicalFiles, saveFile } from './helpers';
import { getManager, QueryFailedError, EntityManager } from 'typeorm';

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

  console.log('req body', req.body);

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

  console.log('user props', userProps);

  const existingUser = await userRepository.findOne(userProps);

  if (!existingUser) {
    return res.status(404).send('User not found');
  }

  console.log('existingUser', existingUser);

  const project = new Project();

  project.title = title;
  project.settings = (settings || {}) as ProjectSettings;
  project.openFilePath = openFilePath;
  project.creator = existingUser;
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

type FilesByDepth = ProjectFile[][];

// Recursively iterates through files and children files to build an index of files by depth
const sortFilesByDepth = (files: ProjectFile[], depth: number = 0, indexIn: FilesByDepth = []): FilesByDepth => {
  let fileLevels: FilesByDepth = indexIn;

  // Create an array for the current depth if it does not exist
  if (!fileLevels[depth]) {
    fileLevels[depth] = [];
  }

  files.forEach((file: ProjectFile) => {
    // Push the current file to the current depth array
    fileLevels[depth].push(file);

    // If the file has children, recursively call this function for the children
    // and increase the depth by 1
    if (file.children && file.children.length) {
      sortFilesByDepth(file.children, depth + 1, fileLevels);
    }
  });

  return fileLevels;
}

router.post('/project/:id', expressjwt(jwtProps), async (req: JWTRequest, res) => {
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

      const { files: existingFiles } = project;
  
      // flatten the `files` variable into a non-nested object
      // It will start as an array of root-level files, which may have children files

      type ProjectFileIndex = { [id:number]: ProjectFile };

      // This function will flatten only the existing files.  New ones will be handled later.
      const flattenProjectFiles = (files: ProjectTreeFile[], startingNewFileIndex?: number, parent?: ProjectFile): ProjectFileIndex => {
        let flattened: ProjectFileIndex = {};
        
        // Since new files will not have ids, this will ensure that they have a unique id
        // in the flattened index
        let newFileIndex = startingNewFileIndex || 0;

        for (let file of files) {
          if (!file) continue;

          newFileIndex--;

          let { children, ...rest } = file;

          if (parent) {
            rest.parent = parent;
          }

          rest.project = project;

          flattened[file.id || newFileIndex] = rest;
      
          if (children) {
            flattened = { ...flattened, ...flattenProjectFiles(children, newFileIndex, rest) };
          }
        }
      
        return flattened;
      }
            
      const filesByDepth = sortFilesByDepth(files);
      const flatFiles = flattenProjectFiles(files);

      // Check if any files have been deleted
      const deletedFiles = existingFiles.filter(file => (!file || !flatFiles[file.id]));
  
      // Delete any files that have been removed
      for (const file of deletedFiles) {
        console.log('deleted file', file.name, file.path, file.id, Boolean(flatFiles[file.id]));
        await transactionalEntityManager.remove(File, [file]);
      }

      // Iterate over each filesByDepth level and check if its file have changed
      for (const depthFiles of filesByDepth) {
        for (const file of depthFiles) {
          const existingFile = existingFiles.find(f => (f && file && f.id === file.id));

          if (existingFile) {
            // The file already exists, so check if it has changed
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
              
              console.log('changed file', file.id, file.name, file.path, existingFile.id, existingFile.project.id, existingFile.name, existingFile.parent);
              await transactionalEntityManager.save(File, existingFile);
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

router.post('/project/:id/addCollaborator', expressjwt(jwtProps), async (req: JWTRequest, res) => {
  console.log('add collaborator', req.body);
  const { search, projectId } = req.body;

  // Get the DataSource and repositories
  const dataSource = await getDataSource();
  const userRepository = dataSource.getRepository(User);
  const projectRepository = dataSource.getRepository(Project);

  // Ensure search text was provided
  if (!search) {
    return res.status(400).send('Search text is required');
  }

  // Determine if search text is a username or email
  const isEmail = search.includes('@');

  // Find the user to be added as a collaborator
  const user = isEmail 
    ? await userRepository.findOne({ where: { email: search } })
    : await userRepository.findOne({ where: { username: search } });

  if (!user) {
    return res.status(404).send(`User not found (${search})`);
  }

  // Find the project
  const project = await projectRepository.findOne({
    where: { id: parseInt(`${projectId}`) },
    relations: ["files", "collaborators", "creator"]
  });

  console.log('project?', project);

  if (!project) {
    return res.status(404).send('Project not found');
  }

  console.log('req auth', req.auth);
  const { files: pFiles, ...projectMain } = project; 

  console.log('project', projectMain);

  // Check if the user is the creator
  if (req.auth?.id !== project.creator.id) {
    return res.status(403).send('Unauthorized');
  }

  const collaborators = project.collaborators || [];

  // Add the user as a collaborator
  if (!collaborators.map(u => u.id).includes(user.id)) {
    collaborators.push(user);
    project.collaborators = collaborators;
  } else {
    return res.status(409).send('User is already a collaborator');
  }

  // Save the project
  await projectRepository.save(project);

  return res.status(200).send(project);
});

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
    select: ["id", "title"]
  });

  console.log('created projects for user', userId, req.auth?.id, createdProjects);

  const collaboratorProjects = await projectRepository.createQueryBuilder("project")
    .innerJoinAndSelect("project.collaborators", "user", "user.id = :uid", { uid: req.auth?.id })
    .select(["project.id", "project.title"])
    .getMany();

    console.log('collaborator projects for user', userId, req.auth?.id, collaboratorProjects);

    return res.status(200).json({ createdProjects, collaboratorProjects });
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