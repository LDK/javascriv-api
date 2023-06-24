import { Repository } from "typeorm";
import { Project } from "../entity/Project";
import { ProjectFile } from "../shm/project-types/ProjectTypes";
import { ProjectTreeFile } from "./projects";
import { File } from "../entity/File";

// Helper function to save a file and its children recursively
export async function saveFile(file:ProjectFile, parentPath:string | null, project:Project, fileRepository:Repository<File>) {
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
      await saveFile(childFile, file.path, project, fileRepository);
    }
  }
}

export interface FileIndex {
  [path:string]: ProjectTreeFile;
}

export const buildHierarchicalFiles = (files:ProjectFile[]) => {
  // The hierarchical files object we will build
  let hierarchicalFiles = [];

  // Maps each path to the corresponding file object
  const pathToFile:FileIndex = {};

  // Populate the initial mapping from paths to file objects
  for (const file of files) {
    pathToFile[file.path] = file as ProjectTreeFile;
  }

  // Now we go through each file, and assign it as a child to its parent in the mapping
  for (const file of (files as ProjectTreeFile[])) {
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

  return hierarchicalFiles;
}

