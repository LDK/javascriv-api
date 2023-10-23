// entity/Project.ts
import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToMany, JoinTable, ManyToOne } from 'typeorm';
import { ProjectSettings } from '../components/javascriv-types/Project/ProjectTypes';
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

  @ManyToOne(() => User)
  creator: User;

  @ManyToMany(() => User)
  @JoinTable()
  collaborators?: User[];

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  lastEdited: Date;

  @ManyToOne(() => User)
  lastEditor?: User;
}
