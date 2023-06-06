// entity/File.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
} from 'typeorm';
import { Project } from './Project';

@Entity()
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
  parent: string | null;

  @Column({ type: 'varchar', nullable: true }) // changed from 'Object'
  subType?: 'document' | 'image' | 'other' | null;

  @Column({ type: 'text', nullable: true })
  attachment?: string;

  @Column({ type: 'text', nullable: true })
  content?: string;

  @Column({ type: 'text', nullable: true })
  initialContent?: string;

  @ManyToOne(() => Project, project => project.files)
  project: Project;
}
