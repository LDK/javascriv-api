import { Project } from '../entity/Project';
import { File } from '../entity/File';
import { getDataSource } from '../database';
import { User } from '../entity/User';
import { ProjectFile } from '@bit/dcompose.javascriv-types.project-types';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { expressjwt, Params, Request as JWTRequest } from "express-jwt";
import { FindOptionsWhere, In } from 'typeorm';
import { ProjectSettings } from '../shm/project-types/ProjectTypes';

const jwtProps:Params = { secret: process.env.SECRET_KEY as string, algorithms: ["HS256"] };

const router = Router();

type ProjectTreeFile = File & { children?: ProjectTreeFile[] };

interface ProjectRequest {
  title: string;
  settings: string;
  openFilePath: string;
  files: ProjectFile[];
  creator: string;
  collaborators: number[];
  id?: string;
}

router.post('/user/project', async (req, res) => {
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

  // Helper function to save a file and its children recursively
  async function saveFile(file:ProjectFile, parentPath:string | null, project:Project) {
    const newFile = new File();
    newFile.type = file.type;
    newFile.name = file.name;
    newFile.path = file.path;
    newFile.parent = parentPath;
    newFile.subType = file.subType;
    newFile.attachment = file.attachment;
    newFile.content = file.content;
    newFile.initialContent = file.initialContent;
    newFile.project = project;

    await fileRepository.save(newFile);

    // Recursively save children if they exist
    if (file.children) {
      for (const childFile of file.children) {
        await saveFile(childFile, file.path, project);
      }
    }
  }

  const existingUser = await userRepository.findOne({ where: { username: creator } });

  if (!existingUser) {
    return res.status(404).send('User not found');
  }

  const collaboratorUsers = await userRepository.findBy({ id: In(collaborators) });

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
    projectToUpdate.settings = (JSON.parse(settings) || {}) as ProjectSettings;
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
      await saveFile(file, null, projectToUpdate);
    }

    return res.status(200).send(projectToUpdate);

  } else {
    const project = new Project();

    project.title = title;
    project.settings = JSON.parse(settings) || {};
    project.openFilePath = openFilePath;
    project.creator = creator;
    project.collaborators = collaboratorUsers;

    await projectRepository.save(project);

    for (const file of files) {
      await saveFile(file, null, project);
    }

    return res.status(201).send(project);
  }
});

router.get('/user/projects', expressjwt(jwtProps), async (req: JWTRequest, res) => {
  
  const username = req.auth?.username;

  // Get the Project Repository from the DataSource
  const dataSource = await getDataSource();
  const projectRepository = dataSource.getRepository(Project);

  const createdProjects = await projectRepository.find({ 
    where: { creator: username },
    select: ["id", "title"]
  });

  const collaboratorProjects = await projectRepository.createQueryBuilder("project")
    .innerJoinAndSelect("project.collaborators", "user", "user.id = :uid", { uid: req.auth?.id })
    .select(["project.id", "project.title"])
    .getMany();

  return res.status(200).json({ createdProjects, collaboratorProjects });
});

interface FileIndex {
  [path:string]: ProjectTreeFile;
}

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
  if (req.auth?.username !== project.creator && !project.collaborators?.map(user => user.id).includes(req.auth?.id)) {
    return res.status(403).send('Unauthorized');
  }

  // The hierarchical files object we will build
  let hierarchicalFiles = [];

  // Maps each path to the corresponding file object
  const pathToFile:FileIndex = {};

  // Populate the initial mapping from paths to file objects
  for (const file of project.files) {
    pathToFile[file.path] = file as ProjectTreeFile;
  }

  // Now we go through each file, and assign it as a child to its parent in the mapping
  for (const file of (project.files as ProjectTreeFile[])) {
    if (file.parent) {
      // The parent file is in the mapping
      const parent = pathToFile[file.parent];

      // Add the file to the parent's children
      if (!parent.children) parent.children = [];
      parent.children.push(file);
    } else {
      // If the file has no parent, it's a top-level file
      hierarchicalFiles.push(file);
    }
  }

  // Replace the flat file array with our newly built hierarchical structure
  project.files = hierarchicalFiles;

  return res.status(200).json(project);
});

export default router;