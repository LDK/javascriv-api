// entity/File.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Unique,
} from 'typeorm';
import { Project } from './Project';
import { User } from './User';

@Entity()
@Unique(["path", "project"])

export class File {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  type: 'folder' | 'file';

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 1000 })
  path: string;

  @Column({ type: 'varchar', nullable: true })
  subType?: 'document' | 'image' | 'other' | null;

  @Column({ type: 'text', nullable: true })
  content?: string;

  @ManyToOne(() => File, file => file.parent)
  parent?: File;

  @ManyToOne(() => Project, project => project.files)
  project: Project;

  @ManyToOne(() => User)
  creator: User;

  @Column({ type: 'timestamp' })
  lastEdited: Date;

  @ManyToOne(() => User)
  editing?: User;

  @ManyToOne(() => User)
  lastEditor: User;
}
