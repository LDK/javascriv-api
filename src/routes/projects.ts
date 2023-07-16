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
  creator: User;
}

interface UpdateProjectRequest extends CreateProjectRequest { }

router.post('/project', expressjwt(jwtProps), async (req: JWTRequest, res) => {
  const { title, settings, openFilePath, files, creator } = req.body as CreateProjectRequest;

  const token = req.headers.authorization?.replace('Bearer ', '');

  let decoded;

  try {
    decoded = jwt.verify(token || '', process.env.SECRET_KEY || ''); 
  } catch (err) {
    return res.status(401).send('Invalid token');
  }

  if (!title || !settings || !openFilePath || !files || !creator) {
    return res.status(400).send('Missing required project data');
  }

  // Get the User, Project and File Repositories from the DataSource
  const dataSource = await getDataSource();
  const userRepository = dataSource.getRepository(User);
  const projectRepository = dataSource.getRepository(Project);
  const fileRepository = dataSource.getRepository(File);

  const userProps = { where: { id: creator.id } };
  const existingUser = await userRepository.findOne(userProps);

  if (!existingUser) {
    return res.status(404).send('User not found');
  }

  const project = new Project();

  project.title = title;
  project.settings = (settings || {}) as ProjectSettings;
  project.openFilePath = openFilePath;
  project.creator = creator;
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

router.post('/project/:id', expressjwt(jwtProps), async (req: JWTRequest, res) => {
  try {
    const dataSource = await getDataSource();

    console.log('params', req.params);

    const projectId = parseInt(req.params.id);

    // Ensure that the project ID is a number
    if (isNaN(projectId)) {
      return res.status(400).send('Invalid project ID');
    }
  
    // Get the various specifics from the request body
    const { title, settings, openFilePath, files } = req.body as UpdateProjectRequest;
  
    console.log('title', title);

    // Instantiate a stand-in project object and populate it with the existing project's data
    // If the project is not found, then the stand-in project will be returned
    let project:Project = new Project();
  
    // Start a transaction
    await dataSource.manager.transaction(async transactionalEntityManager => {
      // Check if the user is either the creator or a collaborator
      console.log('req auth', req.auth);
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
  
      console.log('project.creator', project.creator);

      if (!user || user.id !== project.creator.id && !project.collaborators?.map(user => user.id).includes(req.auth?.id)) {
        throw new Error('Unauthorized');
      }

      console.log('user', user);

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

          rest.projectId = project.id;

          flattened[file.id || newFileIndex] = rest;
      
          if (children) {
            flattened = { ...flattened, ...flattenProjectFiles(children, newFileIndex, rest) };
          }
        }
      
        return flattened;
      }
            
      const flatFiles = flattenProjectFiles(files);

      console.log('flat files', flatFiles);

      // Check if any files have been deleted
      const deletedFiles = existingFiles.filter(file => (!file || !flatFiles[file.id]));
  
      // Delete any files that have been removed
      for (const file of deletedFiles) {
        await transactionalEntityManager.remove(File, [file]);
      }

      // Iterate over flatFiles and check if they have changed
      for (const file of Object.values(flatFiles)) {
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
            
            await transactionalEntityManager.save(File, existingFile);
          }
        } else {
          // The file does not exist, so create it
          console.log('creating file', file);

          await saveFile(file, file.parent, project, transactionalEntityManager.getRepository(File), user);
        }
      }

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
  
      // Save the updated project
      await transactionalEntityManager.save(Project, project);
    });

    // Load a copy of the saved project from the database and return it
    if (project) {
      console.log('project id', project.id);
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