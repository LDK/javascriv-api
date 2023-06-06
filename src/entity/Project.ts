import { ProjectSettings } from '@bit/dcompose.javascriv-types.project-types';
import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToMany, JoinTable } from 'typeorm';
import { File } from './File';
import { User } from './User';

@Entity()
export class Project {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column("json")
  settings?: ProjectSettings;

  @Column({ type: "varchar", nullable: true })
  openFilePath: string;

  @OneToMany(() => File, file => file.project)
  files: File[];

  @Column()
  creator: string;

  @ManyToMany(() => User)
  @JoinTable()
  collaborators?: User[];
}
