import { Project } from '../entity/Project';
import { File } from '../entity/File';
import { getDataSource } from '../database';
import { User } from '../entity/User';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { expressjwt, Params, Request as JWTRequest } from "express-jwt";
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { ProjectFile, ProjectSettings } from '../components/javascriv-types/Project/ProjectTypes';
import { buildHierarchicalFiles, saveFile } from './helpers';

const jwtProps:Params = { secret: process.env.SECRET_KEY as string, algorithms: ["HS256"] };

const router = Router();

export type ProjectTreeFile = File & { children?: ProjectTreeFile[] };

interface ProjectRequest {
  title: string;
  settings: { [key:string]: string | number | null };
  openFilePath: string;
  files: ProjectFile[];
  creator: number;
  collaborators: number[];
  id?: string;
}

router.post('/project', expressjwt(jwtProps), async (req: JWTRequest, res) => {
  const { title, settings, openFilePath, files, creator, collaborators, id } = req.body as ProjectRequest;

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

  // Get the User Repository from the DataSource
  const dataSource = await getDataSource();
  const userRepository = dataSource.getRepository(User);
  const projectRepository = dataSource.getRepository(Project);
  const fileRepository = dataSource.getRepository(File);

  const userProps = { where: { id: creator } };
  const existingUser = await userRepository.findOne(userProps);

  if (!existingUser) {
    return res.status(404).send('User not found');
  }

  let collaboratorUsers:User[] = [];

  // Get the collaborators
  if (collaborators && collaborators.length > 0) {
    collaboratorUsers = await userRepository.findBy({ id: In(collaborators) });
  }

  // If id is present, update the project instead of creating a new one

  if (id) {
    // Get the project from the database
    const projectToUpdate = await projectRepository.findOne({ where: { id: parseInt(id) }, relations: ["files", "collaborators"] });

    // If the project does not exist, return an error
    if (!projectToUpdate) {
      return res.status(404).send('Project not found');
    }

    // Update the project details
    projectToUpdate.title = title;
    projectToUpdate.settings = (settings || {}) as ProjectSettings;
    projectToUpdate.openFilePath = openFilePath;
    projectToUpdate.creator = creator;

    // Update the collaborators
    projectToUpdate.collaborators = collaboratorUsers;

    // Save the updated project
    await projectRepository.save(projectToUpdate);

    // Update the files
    // Deleting old files and adding new ones
    const deleteCriteria:FindOptionsWhere<File> = { project: { id: parseInt(id) } };
    await fileRepository.delete(deleteCriteria);

    for (const file of files) {
      await saveFile(file, null, projectToUpdate, fileRepository);
    }

    return res.status(200).send(projectToUpdate);

  } else {
    const project = new Project();

    project.title = title;
    project.settings = (settings || {}) as ProjectSettings;
    project.openFilePath = openFilePath;
    project.creator = creator;
    project.collaborators = collaboratorUsers;

    await projectRepository.save(project);

    for (const file of files) {
      await saveFile(file, null, project, fileRepository);
    }

    return res.status(201).send(project);
  }
});

// Route to update a single project
router.post('/project/:id', expressjwt(jwtProps), async (req: JWTRequest, res) => {
  const projectId = req.params.id;

  // Get the Project Repository from the DataSource
  const dataSource = await getDataSource();
  const projectRepository = dataSource.getRepository(Project);

  const project = await projectRepository.findOne({
    where: { id: parseInt(`${projectId}`) },
    relations: ["files", "collaborators"]
  });

  if (!project) {
    return res.status(404).send('Project not found');
  }

  // Check if the user is either the creator or a collaborator
  if (req.auth?.id !== project.creator && !project.collaborators?.map(user => user.id).includes(req.auth?.id)) {
    return res.status(403).send('Unauthorized');
  }

  const { title, settings, openFilePath, files, collaborators } = req.body as ProjectRequest;

  if (!title || !settings || !openFilePath || !files) {
    return res.status(400).send('Missing required project data');
  }

  // Get the User Repository from the DataSource
  const userRepository = dataSource.getRepository(User);
  const fileRepository = dataSource.getRepository(File);

  let collaboratorUsers:User[] = [];

  // Get the collaborators
  if (collaborators && collaborators.length > 0) {
    collaboratorUsers = await userRepository.findBy({ id: In(collaborators) });
  }

  // Update the project details
  project.title = title;
  project.settings = (settings || {}) as ProjectSettings;
  project.openFilePath = openFilePath;
  project.collaborators = collaboratorUsers;

  // Save the updated project
  await projectRepository.save(project);
  
  // Update the files
  // Deleting old files and adding new ones
  const deleteCriteria:FindOptionsWhere<File> = { project: { id: parseInt(`${projectId}`) } };
  await fileRepository.delete(deleteCriteria);

  for (const file of files) {
    await saveFile(file, null, project, fileRepository);
  }

  return res.status(200).send(project);
});

router.get('/user/projects', expressjwt(jwtProps), async (req: JWTRequest, res) => {
  const userId = req.auth?.id;

  // Get the Project Repository from the DataSource
  const dataSource = await getDataSource();
  const projectRepository = dataSource.getRepository(Project);

  const createdProjects = await projectRepository.find({ 
    where: { creator: userId },
    select: ["id", "title"]
  });

  const collaboratorProjects = await projectRepository.createQueryBuilder("project")
    .innerJoinAndSelect("project.collaborators", "user", "user.id = :uid", { uid: req.auth?.id })
    .select(["project.id", "project.title"])
    .getMany();

  return res.status(200).json({ createdProjects, collaboratorProjects });
});

router.get('/project/:id', expressjwt(jwtProps), async (req: JWTRequest, res) => {
  const projectId = req.params.id;

  // Get the Project Repository from the DataSource
  const dataSource = await getDataSource();
  const projectRepository = dataSource.getRepository(Project);

  const project = await projectRepository.findOne({ 
    where: { id: parseInt(`${projectId}`) },
    relations: ["files", "collaborators"]
  });

  if (!project) {
    return res.status(404).send('Project not found');
  }

  // Check if the user is either the creator or a collaborator
  if (req.auth?.id !== project.creator && !project.collaborators?.map(user => user.id).includes(req.auth?.id)) {
    return res.status(403).send('Unauthorized');
  }

  // Replace the flat file array with our newly built hierarchical structure
  project.files = buildHierarchicalFiles(project.files);

  return res.status(200).json(project);
});

export default router;