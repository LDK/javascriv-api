import { Repository } from "typeorm";
import { Project } from "../entity/Project";
import { ProjectTreeFile } from "./projects";
import { File } from "../entity/File";
import { User } from "../entity/User";

type CleanUser = Omit<User, 'passwordHash'>;
type ProjectFile = ProjectTreeFile & { 
  changed?: boolean;
  creator: CleanUser;
  lastEditor: CleanUser;
  editing?: CleanUser;
};

// Helper function to save a file and its children recursively
export async function saveFile(file:ProjectTreeFile, parent: File | undefined, project:Project, fileRepository:Repository<File>, user:User) {
  const { children: parentChildren, ...parentFile } = parent ? parent as ProjectTreeFile : { children: undefined };

  const newFile = new File();
  newFile.type = file.type;
  newFile.name = file.name;
  newFile.path = file.path;
  newFile.parent = parent;
  newFile.subType = file.subType;
  newFile.content = file.content;
  newFile.project = project;
  newFile.projectId = project.id;
  newFile.lastEdited = new Date();
  newFile.lastEditor = user;
  if (!file.creator) {
    newFile.creator = user;
  }
  newFile.editing = undefined;

  console.log('saveFile saving file:', newFile);

  await fileRepository.save(newFile);

  console.log('saveFile saved file:', newFile);

  // Recursively save children if they exist
  if (file.children) {
    for (const childFile of file.children) {
      await saveFile(childFile, newFile, project, fileRepository, user);
    }
  }

  // Convert newFile to a ProjectTreeFile called returnFile
  const returnFile:ProjectTreeFile = {
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
    project: newFile.project,
    projectId: newFile.projectId
  }

  return returnFile;
}

export interface FileIndex {
  [id:number]: ProjectTreeFile;
}

export const buildHierarchicalFiles = (files:ProjectTreeFile[]) => {
  let hierarchicalFiles:ProjectFile[] = [];
  const idToFile:FileIndex = {};

  for (const file of files) {
    idToFile[file.id] = file;

    if (!file.parent) {
      const pFile = file as ProjectFile;
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
}

/**
 * Compares two objects deeply and returns true if they are equal.
 *
 * @param obj1 The first object to compare.
 * @param obj2 The second object to compare.
 *
 * @returns {boolean | undefined} Returns true if the objects are equal, false if they are not. 
 * If one or both of the inputs are not objects, returns undefined.
 */

export const areObjectsEqual = (obj1: any, obj2: any) => {
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
      if (!areObjectsEqual(val1, val2)) {
        return false;
      }
    } else if (val1 !== val2) {
      return false;
    }
  }

  return true;
}

