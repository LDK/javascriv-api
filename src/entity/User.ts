// entity/User.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Unique
} from 'typeorm';

@Entity()
@Unique(["username", "email"])
export class User {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  username: string;

  @Column({ select: false })
  email: string;

  @Column({ select: false })
  passwordHash: string;
}
