import { Router } from 'express';
import { User } from '../entity/User';
import bcrypt from 'bcrypt';
import { getDataSource } from '../database';
import jwt from 'jsonwebtoken';

const router = Router();

router.post('/user/register', async (req, res) => {
  const { username, password, email } = req.body;

  if (!username || !password || !email) {
    return res.status(400).send('Missing username, e-mail or password');
  }

  // Get the User Repository from the DataSource
  const dataSource = await getDataSource();
  const userRepository = dataSource.getRepository(User);

  const existingUsername = await userRepository.findOne({ where: { username } });

  if (existingUsername) {
    return res.status(409).send('Username is already taken.');
  }

  const existingEmail = await userRepository.findOne({ where: { email } });

  if (existingEmail) {
    return res.status(409).send('E-mail is already in use.');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = userRepository.create({ username, email, passwordHash });

  await userRepository.save(user);

  const { passwordHash: hash, ...newUser } = user;

  // Signing a JWT using the secret key from the environment variables
  const token = jwt.sign({ id: newUser.id, username: newUser.username }, process.env.SECRET_KEY as string, { expiresIn: '720h' });

  return res.status(201).send({...newUser, token});
});

router.post('/user/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).send('Missing username or password');
  }

  const dataSource = await getDataSource();
  const userRepository = dataSource.getRepository(User);

  const existingUser = await userRepository.findOne({ where: { username } });

  if (!existingUser) {
    return res.status(401).send('Invalid username or password');
  }

  const passwordMatch = await bcrypt.compare(password, existingUser.passwordHash);

  if (!passwordMatch) {
    return res.status(401).send('Invalid username or password');
  }

  // Signing a JWT using the secret key from the environment variables
  const token = jwt.sign({ id: existingUser.id, username: existingUser.username }, process.env.SECRET_KEY as string, { expiresIn: '720h' });

  // Return user data and token
  const { passwordHash, ...user } = existingUser;
  
  return res.status(200).json({ ...user, token });
});

export default router;
