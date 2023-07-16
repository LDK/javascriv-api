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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
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
const helpers_1 = require("./helpers");
const typeorm_1 = require("typeorm");
const jwtProps = { secret: process.env.SECRET_KEY, algorithms: ["HS256"] };
const router = (0, express_1.Router)();
router.post('/project', (0, express_jwt_1.expressjwt)(jwtProps), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { title, settings, openFilePath, files, creator } = req.body;
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
    // Get the User, Project and File Repositories from the DataSource
    const dataSource = yield (0, database_1.getDataSource)();
    const userRepository = dataSource.getRepository(User_1.User);
    const projectRepository = dataSource.getRepository(Project_1.Project);
    const fileRepository = dataSource.getRepository(File_1.File);
    const userProps = { where: { id: creator.id } };
    const existingUser = yield userRepository.findOne(userProps);
    if (!existingUser) {
        return res.status(404).send('User not found');
    }
    const project = new Project_1.Project();
    project.title = title;
    project.settings = (settings || {});
    project.openFilePath = openFilePath;
    project.creator = creator;
    project.collaborators = [];
    yield projectRepository.save(project);
    project.files = [];
    const newFiles = [];
    for (const file of files) {
        const newFile = yield (0, helpers_1.saveFile)(file, undefined, project, fileRepository, existingUser);
        newFiles.push(newFile);
    }
    const savedProject = yield loadProject(project.id);
    return res.status(201).json(savedProject);
}));
router.post('/project/:id', (0, express_jwt_1.expressjwt)(jwtProps), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const dataSource = yield (0, database_1.getDataSource)();
        console.log('params', req.params);
        const projectId = parseInt(req.params.id);
        // Ensure that the project ID is a number
        if (isNaN(projectId)) {
            return res.status(400).send('Invalid project ID');
        }
        // Get the various specifics from the request body
        const { title, settings, openFilePath, files } = req.body;
        console.log('title', title);
        // Instantiate a stand-in project object and populate it with the existing project's data
        // If the project is not found, then the stand-in project will be returned
        let project = new Project_1.Project();
        // Start a transaction
        yield dataSource.manager.transaction((transactionalEntityManager) => __awaiter(void 0, void 0, void 0, function* () {
            var _b, _c, _d;
            // Check if the user is either the creator or a collaborator
            console.log('req auth', req.auth);
            const user = yield transactionalEntityManager.findOne(User_1.User, { where: { id: (_b = req.auth) === null || _b === void 0 ? void 0 : _b.id } });
            // Find the existing project to be updated
            const activeProject = yield transactionalEntityManager.findOne(Project_1.Project, {
                where: { id: projectId },
                relations: ["files", "collaborators", "creator"],
            });
            if (!activeProject) {
                throw new Error('Project not found');
            }
            // Set the project (the object we return at the end) to be updated
            project = activeProject;
            console.log('project.creator', project.creator);
            if (!user || user.id !== project.creator.id && !((_c = project.collaborators) === null || _c === void 0 ? void 0 : _c.map(user => user.id).includes((_d = req.auth) === null || _d === void 0 ? void 0 : _d.id))) {
                throw new Error('Unauthorized');
            }
            console.log('user', user);
            const { files: existingFiles } = project;
            // This function will flatten only the existing files.  New ones will be handled later.
            const flattenProjectFiles = (files, startingNewFileIndex, parent) => {
                let flattened = {};
                // Since new files will not have ids, this will ensure that they have a unique id
                // in the flattened index
                let newFileIndex = startingNewFileIndex || 0;
                for (let file of files) {
                    if (!file)
                        continue;
                    newFileIndex--;
                    let { children } = file, rest = __rest(file, ["children"]);
                    if (parent) {
                        rest.parent = parent;
                    }
                    rest.projectId = project.id;
                    flattened[file.id || newFileIndex] = rest;
                    if (children) {
                        flattened = Object.assign(Object.assign({}, flattened), flattenProjectFiles(children, newFileIndex, rest));
                    }
                }
                return flattened;
            };
            const flatFiles = flattenProjectFiles(files);
            console.log('flat files', flatFiles);
            // Check if any files have been deleted
            const deletedFiles = existingFiles.filter(file => (!file || !flatFiles[file.id]));
            // Delete any files that have been removed
            for (const file of deletedFiles) {
                yield transactionalEntityManager.remove(File_1.File, [file]);
            }
            // Iterate over flatFiles and check if they have changed
            for (const file of Object.values(flatFiles)) {
                const existingFile = existingFiles.find(f => (f && file && f.id === file.id));
                if (existingFile) {
                    // The file already exists, so check if it has changed
                    if (existingFile.content !== file.content ||
                        existingFile.name !== file.name ||
                        existingFile.path !== file.path ||
                        existingFile.parent !== file.parent) {
                        // The file has changed, so update it
                        existingFile.content = file.content;
                        existingFile.name = file.name;
                        existingFile.path = file.path;
                        existingFile.parent = file.parent;
                        existingFile.lastEdited = new Date();
                        existingFile.lastEditor = user;
                        yield transactionalEntityManager.save(File_1.File, existingFile);
                    }
                }
                else {
                    // The file does not exist, so create it
                    console.log('creating file', file);
                    yield (0, helpers_1.saveFile)(file, file.parent, project, transactionalEntityManager.getRepository(File_1.File), user);
                }
            }
            if (!title || !settings || !openFilePath || !files) {
                throw new Error('Missing required project data');
            }
            // Update the project details
            project.title = title;
            // If the settings have changed, update them
            if (!(0, helpers_1.areObjectsEqual)(project.settings, settings)) {
                project.settings = (settings || {});
            }
            // Set the open file path
            project.openFilePath = openFilePath;
            // Save the updated project
            yield transactionalEntityManager.save(Project_1.Project, project);
        }));
        // Load a copy of the saved project from the database and return it
        if (project) {
            console.log('project id', project.id);
            const savedProject = yield loadProject(project.id);
            return res.status(200).json(savedProject);
        }
        return res.status(200).send(project);
    }
    catch (error) {
        if (error instanceof typeorm_1.QueryFailedError) {
            return res.status(500).send(`Database Query Failed: ${error.message}`);
        }
        else if (error instanceof Error) {
            return res.status(400).send(error.message);
        }
        return res.status(500).send('Something went wrong');
    }
}));
router.post('/project/:id/addCollaborator', (0, express_jwt_1.expressjwt)(jwtProps), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _e;
    console.log('add collaborator', req.body);
    const { search, projectId } = req.body;
    // Get the DataSource and repositories
    const dataSource = yield (0, database_1.getDataSource)();
    const userRepository = dataSource.getRepository(User_1.User);
    const projectRepository = dataSource.getRepository(Project_1.Project);
    // Ensure search text was provided
    if (!search) {
        return res.status(400).send('Search text is required');
    }
    // Determine if search text is a username or email
    const isEmail = search.includes('@');
    // Find the user to be added as a collaborator
    const user = isEmail
        ? yield userRepository.findOne({ where: { email: search } })
        : yield userRepository.findOne({ where: { username: search } });
    if (!user) {
        return res.status(404).send(`User not found (${search})`);
    }
    // Find the project
    const project = yield projectRepository.findOne({
        where: { id: parseInt(`${projectId}`) },
        relations: ["files", "collaborators", "creator"]
    });
    console.log('project?', project);
    if (!project) {
        return res.status(404).send('Project not found');
    }
    console.log('req auth', req.auth);
    const { files: pFiles } = project, projectMain = __rest(project, ["files"]);
    console.log('project', projectMain);
    // Check if the user is the creator
    if (((_e = req.auth) === null || _e === void 0 ? void 0 : _e.id) !== project.creator.id) {
        return res.status(403).send('Unauthorized');
    }
    const collaborators = project.collaborators || [];
    // Add the user as a collaborator
    if (!collaborators.map(u => u.id).includes(user.id)) {
        collaborators.push(user);
        project.collaborators = collaborators;
    }
    else {
        return res.status(409).send('User is already a collaborator');
    }
    // Save the project
    yield projectRepository.save(project);
    return res.status(200).send(project);
}));
router.get('/user/projects', (0, express_jwt_1.expressjwt)(jwtProps), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _f, _g, _h, _j;
    const userId = (_f = req.auth) === null || _f === void 0 ? void 0 : _f.id;
    // Get the Project Repository from the DataSource
    const dataSource = yield (0, database_1.getDataSource)();
    const projectRepository = dataSource.getRepository(Project_1.Project);
    const userRepository = dataSource.getRepository(User_1.User);
    const user = yield userRepository.findOne({ where: { id: userId } });
    if (!user) {
        return res.status(404).send('User not found');
    }
    const createdProjects = yield projectRepository.find({
        where: { creator: user },
        select: ["id", "title"]
    });
    console.log('created projects for user', userId, (_g = req.auth) === null || _g === void 0 ? void 0 : _g.id, createdProjects);
    const collaboratorProjects = yield projectRepository.createQueryBuilder("project")
        .innerJoinAndSelect("project.collaborators", "user", "user.id = :uid", { uid: (_h = req.auth) === null || _h === void 0 ? void 0 : _h.id })
        .select(["project.id", "project.title"])
        .getMany();
    console.log('collaborator projects for user', userId, (_j = req.auth) === null || _j === void 0 ? void 0 : _j.id, collaboratorProjects);
    return res.status(200).json({ createdProjects, collaboratorProjects });
}));
const loadProject = (projectId) => __awaiter(void 0, void 0, void 0, function* () {
    // Get the Project Repository from the DataSource
    const dataSource = yield (0, database_1.getDataSource)();
    const projectRepository = dataSource.getRepository(Project_1.Project);
    const project = yield projectRepository.findOne({
        where: { id: projectId },
        relations: ["files", "files.parent", "files.creator", "files.editing", "files.lastEditor", "collaborators", "creator"]
    });
    if (!project) {
        return null;
    }
    // Replace the flat file array with our newly built hierarchical structure
    const projectFiles = (0, helpers_1.buildHierarchicalFiles)(project.files);
    return Object.assign(Object.assign({}, project), { files: projectFiles });
});
router.get('/project/:id', (0, express_jwt_1.expressjwt)(jwtProps), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _k, _l, _m;
    const projectId = parseInt(req.params.id);
    // Ensure that the project ID is a number
    if (isNaN(projectId)) {
        return res.status(400).send('Invalid project ID');
    }
    // Get the Project Repository from the DataSource
    const project = yield loadProject(projectId);
    // Check if the project exists
    if (!project) {
        return res.status(404).send('Project not found');
    }
    // Check if the user is either the creator or a collaborator
    if (((_k = req.auth) === null || _k === void 0 ? void 0 : _k.id) !== project.creator.id && !((_l = project.collaborators) === null || _l === void 0 ? void 0 : _l.map(user => user.id).includes((_m = req.auth) === null || _m === void 0 ? void 0 : _m.id))) {
        return res.status(403).send('Unauthorized');
    }
    // Return the project
    return res.status(200).json(project);
}));
exports.default = router;
