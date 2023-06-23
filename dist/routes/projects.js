"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Project_1 = require("../entity/Project");
const File_1 = require("../entity/File");
const database_1 = require("../database");
const User_1 = require("../entity/User");
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const express_jwt_1 = require("express-jwt");
const typeorm_1 = require("typeorm");
const jwtProps = { secret: process.env.SECRET_KEY, algorithms: ["HS256"] };
const router = (0, express_1.Router)();
router.post('/user/project', async (req, res) => {
    var _a;
    const { title, settings, openFilePath, files, creator, collaborators, id } = req.body;
    const token = (_a = req.headers.authorization) === null || _a === void 0 ? void 0 : _a.replace('Bearer ', '');
    let decoded;
    try {
        decoded = jsonwebtoken_1.default.verify(token || '', process.env.SECRET_KEY || '');
    }
    catch (err) {
        return res.status(401).send('Invalid token');
    }
    if (!title || !settings || !openFilePath || !files || !creator) {
        return res.status(400).send('Missing required project data');
    }
    // Get the User Repository from the DataSource
    const dataSource = await (0, database_1.getDataSource)();
    const userRepository = dataSource.getRepository(User_1.User);
    const projectRepository = dataSource.getRepository(Project_1.Project);
    const fileRepository = dataSource.getRepository(File_1.File);
    // Helper function to save a file and its children recursively
    async function saveFile(file, parentPath, project) {
        const newFile = new File_1.File();
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
    const collaboratorUsers = await userRepository.findBy({ id: (0, typeorm_1.In)(collaborators) });
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
        projectToUpdate.settings = (JSON.parse(settings) || {});
        projectToUpdate.openFilePath = openFilePath;
        projectToUpdate.creator = creator;
        // Update the collaborators
        projectToUpdate.collaborators = collaboratorUsers;
        // Save the updated project
        await projectRepository.save(projectToUpdate);
        // Update the files
        // Deleting old files and adding new ones
        const deleteCriteria = { project: { id: parseInt(id) } };
        await fileRepository.delete(deleteCriteria);
        for (const file of files) {
            await saveFile(file, null, projectToUpdate);
        }
        return res.status(200).send(projectToUpdate);
    }
    else {
        const project = new Project_1.Project();
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
router.get('/user/projects', (0, express_jwt_1.expressjwt)(jwtProps), async (req, res) => {
    var _a, _b;
    const username = (_a = req.auth) === null || _a === void 0 ? void 0 : _a.username;
    // Get the Project Repository from the DataSource
    const dataSource = await (0, database_1.getDataSource)();
    const projectRepository = dataSource.getRepository(Project_1.Project);
    const createdProjects = await projectRepository.find({
        where: { creator: username },
        select: ["id", "title"]
    });
    const collaboratorProjects = await projectRepository.createQueryBuilder("project")
        .innerJoinAndSelect("project.collaborators", "user", "user.id = :uid", { uid: (_b = req.auth) === null || _b === void 0 ? void 0 : _b.id })
        .select(["project.id", "project.title"])
        .getMany();
    return res.status(200).json({ createdProjects, collaboratorProjects });
});
router.get('/project/:id', (0, express_jwt_1.expressjwt)(jwtProps), async (req, res) => {
    var _a, _b, _c;
    const projectId = req.params.id;
    // Get the Project Repository from the DataSource
    const dataSource = await (0, database_1.getDataSource)();
    const projectRepository = dataSource.getRepository(Project_1.Project);
    const project = await projectRepository.findOne({
        where: { id: parseInt(`${projectId}`) },
        relations: ["files", "collaborators"]
    });
    if (!project) {
        return res.status(404).send('Project not found');
    }
    // Check if the user is either the creator or a collaborator
    if (((_a = req.auth) === null || _a === void 0 ? void 0 : _a.username) !== project.creator && !((_b = project.collaborators) === null || _b === void 0 ? void 0 : _b.map(user => user.id).includes((_c = req.auth) === null || _c === void 0 ? void 0 : _c.id))) {
        return res.status(403).send('Unauthorized');
    }
    // The hierarchical files object we will build
    let hierarchicalFiles = [];
    // Maps each path to the corresponding file object
    const pathToFile = {};
    // Populate the initial mapping from paths to file objects
    for (const file of project.files) {
        pathToFile[file.path] = file;
    }
    // Now we go through each file, and assign it as a child to its parent in the mapping
    for (const file of project.files) {
        if (file.parent) {
            // The parent file is in the mapping
            const parent = pathToFile[file.parent];
            // Add the file to the parent's children
            if (!parent.children)
                parent.children = [];
            parent.children.push(file);
        }
        else {
            // If the file has no parent, it's a top-level file
            hierarchicalFiles.push(file);
        }
    }
    // Replace the flat file array with our newly built hierarchical structure
    project.files = hierarchicalFiles;
    return res.status(200).json(project);
});
exports.default = router;
