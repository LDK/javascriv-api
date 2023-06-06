export type ProjectFile = {
  type: 'folder' | 'file';
  name: string;
  path: string;
  children?: ProjectFile[];
  subType?: 'document' | 'image' | 'other' | null;
  attachment?: string;
  content?: string;
  initialContent?: string;
  changed?: boolean;
};

export type ProjectSettings = {
  [key: string]: string | number | boolean | null;
};

export type ProjectState = {
  files: ProjectFile[];
  openFilePath: string | null;
  settings?: ProjectSettings;
  title?: string;
};