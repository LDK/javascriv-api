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

  @Column({ type: 'json', nullable: true })
  publishOptions?: { [key: string]: string | number | boolean };

  @Column({ select: false })
  passwordHash: string;

}
