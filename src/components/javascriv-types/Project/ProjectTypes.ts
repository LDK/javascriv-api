import { User } from "../../../entity/User";
import { EditorFont } from "../Editor/EditorFonts";

export type ProjectFile = {
  id?: number;
  type: 'folder' | 'file';
  name: string;
  path: string;
  children?: ProjectFile[];
  subType?: 'document' | 'image' | 'other' | null;
  attachment?: string;
  content?: string;
  initialContent?: string;
  changed?: boolean;
  creator: User;
  lastEdited: Date;
  lastEditor: User;
  editing?: User;
  parent?: ProjectFile;
};

export type ProjectSettings = {
  [key: string]: string | number | boolean | EditorFont | null;
};

export type ProjectState = {
  files: ProjectFile[];
  openFilePath: string | null;
  settings?: ProjectSettings;
  title?: string;
};