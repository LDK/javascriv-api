// entity/User.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Unique
} from 'typeorm';
import { EditorFont } from '../components/javascriv-types/Editor/EditorFonts';

@Entity()
@Unique(["username", "email"])
export class User {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  username: string;

  @Column({ select: false })
  email: string;

  @Column({ type: 'json', nullable: true })
  publishOptions?: { [key: string]: string | number | boolean };

  @Column({ type: 'json', nullable: true })
  fontOptions?: { [key: string]: EditorFont | number };

  @Column({ select: false })
  passwordHash: string;

}
