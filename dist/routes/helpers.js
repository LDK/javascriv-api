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
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildHierarchicalFiles = exports.saveFile = void 0;
const File_1 = require("../entity/File");
// Helper function to save a file and its children recursively
function saveFile(file, parentPath, project, fileRepository) {
    return __awaiter(this, void 0, void 0, function* () {
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
        yield fileRepository.save(newFile);
        // Recursively save children if they exist
        if (file.children) {
            for (const childFile of file.children) {
                yield saveFile(childFile, file.path, project, fileRepository);
            }
        }
    });
}
exports.saveFile = saveFile;
const buildHierarchicalFiles = (files) => {
    // The hierarchical files object we will build
    let hierarchicalFiles = [];
    // Maps each path to the corresponding file object
    const pathToFile = {};
    // Populate the initial mapping from paths to file objects
    for (const file of files) {
        pathToFile[file.path] = file;
    }
    // Now we go through each file, and assign it as a child to its parent in the mapping
    for (const file of files) {
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
    return hierarchicalFiles;
};
exports.buildHierarchicalFiles = buildHierarchicalFiles;
