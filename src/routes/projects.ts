import { Project } from '../entity/Project';
import { File } from '../entity/File';
import { getDataSource } from '../database';
import { User } from '../entity/User';
import { ProjectFile } from '@bit/dcompose.javascriv-types.project-types';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { expressjwt, Request as JWTRequest } from "express-jwt";
import { In } from 'typeorm';

const router = Router();

interface ProjectRequest {
  title: string;
  settings: string;
  openFilePath: string;
  files: ProjectFile[];
  creator: string;
  collaborators: number[];
  id: string;
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
});

router.get('/user/projects', expressjwt({ secret: process.env.SECRET_KEY as string, algorithms: ["HS256"] }), async (req: JWTRequest<any>, res) => {
  
  const username = req.auth?.username;
  console.log('username', username);

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

router.get('/user/project/:id', expressjwt({ secret: process.env.SECRET_KEY as string, algorithms: ["HS256"] }), async (req: JWTRequest, res) => {
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

  return res.status(200).json(project);
});

export default router;