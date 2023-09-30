"use strict";
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
exports.flattenProjectFiles = exports.sortFilesByDepth = void 0;
// Recursively iterates through files and children files to build an index of files by depth
const sortFilesByDepth = (files, depth = 0, indexIn = []) => {
    let fileLevels = indexIn;
    // Create an array for the current depth if it does not exist
    if (!fileLevels[depth]) {
        fileLevels[depth] = [];
    }
    files.forEach((file) => {
        if (!depth) {
            console.log('setting parent to null', file.name, file.parent);
            file.parent = null;
        }
        // Push the current file to the current depth array
        fileLevels[depth].push(file);
        // If the file has children, recursively call this function for the children
        // and increase the depth by 1
        if (file.children && file.children.length) {
            sortFilesByDepth(file.children, depth + 1, fileLevels);
        }
    });
    console.log('files by depth', fileLevels);
    return fileLevels;
};
exports.sortFilesByDepth = sortFilesByDepth;
// This function will flatten only the existing files.  New ones will be handled later.
const flattenProjectFiles = (project, files, startingNewFileIndex, parent) => {
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
        rest.project = project;
        flattened[file.id || newFileIndex] = rest;
        if (children) {
            flattened = Object.assign(Object.assign({}, flattened), flattenProjectFiles(project, children, newFileIndex, rest));
        }
    }
    console.log('flattened files', flattened);
    return flattened;
};
exports.flattenProjectFiles = flattenProjectFiles;
