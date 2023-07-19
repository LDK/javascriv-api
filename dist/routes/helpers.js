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
Object.defineProperty(exports, "__esModule", { value: true });
exports.areObjectsEqual = exports.buildHierarchicalFiles = exports.saveFile = void 0;
const File_1 = require("../entity/File");
// Helper function to save a file and its children recursively
function saveFile(file, parent, project, fileRepository, user) {
    return __awaiter(this, void 0, void 0, function* () {
        const _a = parent ? parent : { children: undefined }, { children: parentChildren } = _a, parentFile = __rest(_a, ["children"]);
        const newFile = new File_1.File();
        newFile.type = file.type;
        newFile.name = file.name;
        newFile.path = file.path;
        newFile.parent = parent;
        newFile.subType = file.subType;
        newFile.content = file.content;
        newFile.project = project;
        newFile.lastEdited = new Date();
        newFile.lastEditor = user;
        newFile.creator = file.creator || user;
        newFile.editing = undefined;
        newFile.id = file.id;
        console.log('saveFile saving file:', newFile.name, newFile.id, newFile.path, newFile.project.id);
        yield fileRepository.save(newFile);
        console.log('saveFile saved file:', newFile.name, newFile.id, newFile.path, newFile.project.id);
        // Recursively save children if they exist
        if (file.children) {
            for (const childFile of file.children) {
                console.log('saving child', childFile.path);
                yield saveFile(childFile, newFile, project, fileRepository, user);
            }
        }
        // Convert newFile to a ProjectTreeFile called returnFile
        const returnFile = {
            id: newFile.id,
            type: newFile.type,
            name: newFile.name,
            path: newFile.path,
            parent: newFile.parent,
            subType: newFile.subType,
            content: newFile.content,
            creator: newFile.creator,
            lastEdited: newFile.lastEdited,
            lastEditor: newFile.lastEditor,
            editing: newFile.editing,
            project: newFile.project
        };
        return returnFile;
    });
}
exports.saveFile = saveFile;
const buildHierarchicalFiles = (files) => {
    let hierarchicalFiles = [];
    const idToFile = {};
    for (const file of files) {
        idToFile[file.id] = file;
        if (!file.parent) {
            const pFile = file;
            hierarchicalFiles.push(pFile);
        }
    }
    let hasChanges = true;
    while (hasChanges) {
        hasChanges = false;
        for (const file of files) {
            if (file.parent && file.parent.id) {
                const parent = idToFile[file.parent.id];
                if (parent && (!parent.children || !parent.children.includes(file))) {
                    if (!parent.children) {
                        parent.children = [];
                    }
                    delete file.parent;
                    parent.children.push(file);
                    hasChanges = true;
                }
            }
        }
    }
    return hierarchicalFiles;
};
exports.buildHierarchicalFiles = buildHierarchicalFiles;
/**
 * Compares two objects deeply and returns true if they are equal.
 *
 * @param obj1 The first object to compare.
 * @param obj2 The second object to compare.
 *
 * @returns {boolean | undefined} Returns true if the objects are equal, false if they are not.
 * If one or both of the inputs are not objects, returns undefined.
 */
const areObjectsEqual = (obj1, obj2) => {
    if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
        return undefined;
    }
    const keys1 = Object.keys(obj1).sort();
    const keys2 = Object.keys(obj2).sort();
    if (keys1.length !== keys2.length) {
        return false;
    }
    for (let i = 0; i < keys1.length; i++) {
        if (keys1[i] !== keys2[i]) {
            return false;
        }
        const val1 = obj1[keys1[i]];
        const val2 = obj2[keys2[i]];
        if (typeof val1 === 'object' && typeof val2 === 'object') {
            if (!(0, exports.areObjectsEqual)(val1, val2)) {
                return false;
            }
        }
        else if (val1 !== val2) {
            return false;
        }
    }
    return true;
};
exports.areObjectsEqual = areObjectsEqual;
