import { Project } from "../../entity/Project";
import { FilesByDepth, ProjectTreeFile } from "../projects";
type ProjectFile = ProjectTreeFile & { changed?: boolean; children?: ProjectFile[] };
type ProjectFileIndex = { [id:number]: ProjectFile };

// Recursively iterates through files and children files to build an index of files by depth
const sortFilesByDepth = (files: ProjectFile[], depth: number = 0, indexIn: FilesByDepth = []): FilesByDepth => {
  let fileLevels: FilesByDepth = indexIn;

  // Create an array for the current depth if it does not exist
  if (!fileLevels[depth]) {
    fileLevels[depth] = [];
  }

  files.forEach((file: ProjectFile) => {
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
}

// This function will flatten only the existing files.  New ones will be handled later.
const flattenProjectFiles = (project: Project, files: ProjectTreeFile[], startingNewFileIndex?: number, parent?: ProjectFile): ProjectFileIndex => {
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

    rest.project = project;

    flattened[file.id || newFileIndex] = rest;

    if (children) {
      flattened = { ...flattened, ...flattenProjectFiles(project, children, newFileIndex, rest) };
    }
  }

  console.log('flattened files', flattened);
  return flattened;
}

export { sortFilesByDepth, flattenProjectFiles };