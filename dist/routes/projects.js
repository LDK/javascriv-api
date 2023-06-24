"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
const helpers_1 = require("./helpers");
const jwtProps = { secret: process.env.SECRET_KEY, algorithms: ["HS256"] };
const router = (0, express_1.Router)();
router.post('/project', (0, express_jwt_1.expressjwt)(jwtProps), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
    const dataSource = yield (0, database_1.getDataSource)();
    const userRepository = dataSource.getRepository(User_1.User);
    const projectRepository = dataSource.getRepository(Project_1.Project);
    const fileRepository = dataSource.getRepository(File_1.File);
    const userProps = { where: { id: creator } };
    const existingUser = yield userRepository.findOne(userProps);
    if (!existingUser) {
        return res.status(404).send('User not found');
    }
    let collaboratorUsers = [];
    // Get the collaborators
    if (collaborators && collaborators.length > 0) {
        collaboratorUsers = yield userRepository.findBy({ id: (0, typeorm_1.In)(collaborators) });
    }
    // If id is present, update the project instead of creating a new one
    if (id) {
        // Get the project from the database
        const projectToUpdate = yield projectRepository.findOne({ where: { id: parseInt(id) }, relations: ["files", "collaborators"] });
        // If the project does not exist, return an error
        if (!projectToUpdate) {
            return res.status(404).send('Project not found');
        }
        // Update the project details
        projectToUpdate.title = title;
        projectToUpdate.settings = (settings || {});
        projectToUpdate.openFilePath = openFilePath;
        projectToUpdate.creator = creator;
        // Update the collaborators
        projectToUpdate.collaborators = collaboratorUsers;
        // Save the updated project
        yield projectRepository.save(projectToUpdate);
        // Update the files
        // Deleting old files and adding new ones
        const deleteCriteria = { project: { id: parseInt(id) } };
        yield fileRepository.delete(deleteCriteria);
        for (const file of files) {
            yield (0, helpers_1.saveFile)(file, null, projectToUpdate, fileRepository);
        }
        return res.status(200).send(projectToUpdate);
    }
    else {
        const project = new Project_1.Project();
        project.title = title;
        project.settings = (settings || {});
        project.openFilePath = openFilePath;
        project.creator = creator;
        project.collaborators = collaboratorUsers;
        yield projectRepository.save(project);
        for (const file of files) {
            yield (0, helpers_1.saveFile)(file, null, project, fileRepository);
        }
        return res.status(201).send(project);
    }
}));
// Route to update a single project
router.post('/project/:id', (0, express_jwt_1.expressjwt)(jwtProps), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _b, _c, _d;
    const projectId = req.params.id;
    // Get the Project Repository from the DataSource
    const dataSource = yield (0, database_1.getDataSource)();
    const projectRepository = dataSource.getRepository(Project_1.Project);
    const project = yield projectRepository.findOne({
        where: { id: parseInt(`${projectId}`) },
        relations: ["files", "collaborators"]
    });
    if (!project) {
        return res.status(404).send('Project not found');
    }
    // Check if the user is either the creator or a collaborator
    if (((_b = req.auth) === null || _b === void 0 ? void 0 : _b.id) !== project.creator && !((_c = project.collaborators) === null || _c === void 0 ? void 0 : _c.map(user => user.id).includes((_d = req.auth) === null || _d === void 0 ? void 0 : _d.id))) {
        return res.status(403).send('Unauthorized');
    }
    const { title, settings, openFilePath, files, collaborators } = req.body;
    if (!title || !settings || !openFilePath || !files) {
        return res.status(400).send('Missing required project data');
    }
    // Get the User Repository from the DataSource
    const userRepository = dataSource.getRepository(User_1.User);
    const fileRepository = dataSource.getRepository(File_1.File);
    let collaboratorUsers = [];
    // Get the collaborators
    if (collaborators && collaborators.length > 0) {
        collaboratorUsers = yield userRepository.findBy({ id: (0, typeorm_1.In)(collaborators) });
    }
    // Update the project details
    project.title = title;
    project.settings = (settings || {});
    project.openFilePath = openFilePath;
    project.collaborators = collaboratorUsers;
    // Save the updated project
    yield projectRepository.save(project);
    // Update the files
    // Deleting old files and adding new ones
    const deleteCriteria = { project: { id: parseInt(`${projectId}`) } };
    yield fileRepository.delete(deleteCriteria);
    for (const file of files) {
        yield (0, helpers_1.saveFile)(file, null, project, fileRepository);
    }
    return res.status(200).send(project);
}));
router.get('/user/projects', (0, express_jwt_1.expressjwt)(jwtProps), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _e, _f;
    const userId = (_e = req.auth) === null || _e === void 0 ? void 0 : _e.id;
    // Get the Project Repository from the DataSource
    const dataSource = yield (0, database_1.getDataSource)();
    const projectRepository = dataSource.getRepository(Project_1.Project);
    const createdProjects = yield projectRepository.find({
        where: { creator: userId },
        select: ["id", "title"]
    });
    const collaboratorProjects = yield projectRepository.createQueryBuilder("project")
        .innerJoinAndSelect("project.collaborators", "user", "user.id = :uid", { uid: (_f = req.auth) === null || _f === void 0 ? void 0 : _f.id })
        .select(["project.id", "project.title"])
        .getMany();
    return res.status(200).json({ createdProjects, collaboratorProjects });
}));
router.get('/project/:id', (0, express_jwt_1.expressjwt)(jwtProps), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _g, _h, _j;
    const projectId = req.params.id;
    // Get the Project Repository from the DataSource
    const dataSource = yield (0, database_1.getDataSource)();
    const projectRepository = dataSource.getRepository(Project_1.Project);
    const project = yield projectRepository.findOne({
        where: { id: parseInt(`${projectId}`) },
        relations: ["files", "collaborators"]
    });
    if (!project) {
        return res.status(404).send('Project not found');
    }
    // Check if the user is either the creator or a collaborator
    if (((_g = req.auth) === null || _g === void 0 ? void 0 : _g.id) !== project.creator && !((_h = project.collaborators) === null || _h === void 0 ? void 0 : _h.map(user => user.id).includes((_j = req.auth) === null || _j === void 0 ? void 0 : _j.id))) {
        return res.status(403).send('Unauthorized');
    }
    // Replace the flat file array with our newly built hierarchical structure
    project.files = (0, helpers_1.buildHierarchicalFiles)(project.files);
    return res.status(200).json(project);
}));
exports.default = router;
