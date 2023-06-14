import { getDataSource } from '../database';
import { User } from '../entity/User';

const dataSource = getDataSource();

export const UserRepository = dataSource.then(ds => ds.getRepository(User).extend({
  findByName(name: string) {
    return this.findOne({ where: { username: name } });
  }
}));
