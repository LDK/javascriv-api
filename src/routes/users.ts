import { Router } from 'express';
import { User } from '../entity/User';
import bcrypt from 'bcrypt';
import { getDataSource } from '../database';
import jwt from 'jsonwebtoken';
import Mailgun from 'mailgun-js';
import { In, Not, QueryFailedError } from 'typeorm';
import { expressjwt, Params, Request as JWTRequest } from "express-jwt";
import { EditorFont } from '../components/javascriv-types/Editor/EditorFonts';
import { File } from '../entity/File';
import { Project } from '../entity/Project';

const jwtProps:Params = { secret: process.env.SECRET_KEY as string, algorithms: ["HS256"] };

const router = Router();

router.post('/user/register', async (req, res) => {
  const { username, password, email } = req.body;

  if (!username || !password || !email) {
    return res.status(400).send('Missing username, e-mail or password');
  }

  if (username.includes('@')) {
    return res.status(400).send('Username cannot contain @ symbol.');
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

  const user:User = userRepository.create({ username, email, passwordHash });

  await userRepository.save(user);

  const { passwordHash: hash, ...newUser } = user;

  // Signing a JWT using the secret key from the environment variables
  const token = jwt.sign({ id: newUser.id, username: newUser.username }, process.env.SECRET_KEY as string, { expiresIn: '720h' });

  const mailService = process.env.MAIL_SERVICE as string;

  switch (mailService) {
    case 'mailgun':
      // Initialize mailgun
      const mailgun = Mailgun({ apiKey: process.env.MAILGUN_API_KEY as string, domain: process.env.MAILGUN_DOMAIN as string });

      const data = {
        from: 'javaScriv <lemondropkid@gmail.com>',
        to: email,
        subject: 'Welcome to javaScriv!',
        text: `
          Thank you for signing up for the javaScriv app.
          Please visit https://javascriv.electric-bungalow.com to get started.
        `
      };
    
      mailgun.messages().send(data, (error, body) => {
        if (error) {
          console.error('Failed to send email', error);
        } else {
          console.log('Email sent', body);
        }
      });
    
    break;

    case 'postmark':
      // Initialize postmark
      // Require:
      var postmark = require("postmark");

      // Send an email:
      var client = new postmark.ServerClient(process.env.POSTMARK_API_KEY as string);

      client.sendEmail({
        "From": "javaScriv@electric-bungalow.com",
        "To": email,
        "Subject": "Welcome to javaScriv!",
        "HtmlBody": `
          <strong>Thank you for signing up for the javaScriv app.</strong>
          <p>Please visit <a href="https://javascriv.electric-bungalow.com">https://javascriv.electric-bungalow.com</a> to get started.</p>
        `,
        "TextBody": "Thank you for signing up for the javaScriv app.  Please visit https://javascriv.electric-bungalow.com to get started.",
        "MessageStream": "outbound"
      });

    break;
  }

  return res.status(201).send({...newUser, token});
});

router.post('/user/new-password', expressjwt(jwtProps), async (req: JWTRequest, res) => {
  const { newPassword: password, newPasswordConfirm: passwordConfirm } = req.body;

  if (!password || !passwordConfirm) {
    return res.status(400).send('Missing password or password confirmation');
  }

  if (password !== passwordConfirm) {
    return res.status(400).send('Password and password confirmation do not match.');
  }

  const dataSource = await getDataSource();
  const userRepository = dataSource.getRepository(User);

  const user = await userRepository.findOne(
    { 
      select: ['id', 'username', 'email', 'publishOptions', 'fontOptions'],
      where: { id: req.auth?.id } 
    }
  );

  if (!user || user.id !== req.auth?.id) {
    return res.status(404).send('User not found.');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  user.passwordHash = passwordHash;
  userRepository.save(user);

  const token = jwt.sign({ id: user.id, username: user.username }, process.env.SECRET_KEY as string, { expiresIn: '720h' });

  return res.status(200).json({ ...user, token });
});

router.post('/user/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).send('Missing e-mail');
  }

  const dataSource = await getDataSource();
  const userRepository = dataSource.getRepository(User);

  const user = await userRepository.findOne({ where: { email }, select: ["id", "username", "passwordHash", "email", "publishOptions"] });

  if (!user) {
    return res.status(404).send('User not found.');
  }

  // Signing a JWT using the secret key from the environment variables
  const token = jwt.sign({ id: user.id, username: user.username }, process.env.SECRET_KEY as string, { expiresIn: '720h' });

  const mailService = process.env.MAIL_SERVICE as string;

  switch (mailService) {
    case 'mailgun':
      // Initialize mailgun
      const mailgun = Mailgun({ apiKey: process.env.MAILGUN_API_KEY as string, domain: process.env.MAILGUN_DOMAIN as string });

      const data = {
        from: 'javaScriv <lemondropkid@gmail.com>',
        to: email,
        subject: 'Reset your javaScriv password',
        text: `Please visit https://javascriv.electric-bungalow.com/reset-password/${token} to reset your password.`
      };

      mailgun.messages().send(data, (error, body) => {
        if (error) {
          console.error('Failed to send email', error);
        } else {
          console.log('Email sent', body);
        }
      });
    
    break;

    case 'postmark':
      // Initialize postmark
      // Require:
      var postmark = require("postmark");

      // Send an email:
      var client = new postmark.ServerClient(process.env.POSTMARK_API_KEY as string);

      client.sendEmail({
        from: 'javaScriv <lemondropkid@gmail.com>',
        to: email,
        subject: 'Reset your javaScriv password',
        htmlBody: `
          <p>Please visit <a href="https://javascriv.electric-bungalow.com/reset-password/${token}">https://javascriv.electric-bungalow.com/reset-password/${token}</a> to reset your password.</p>
        `,
      });
    break;
  }

  return res.status(200).send('Password reset link sent.');

});

router.post('/user/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).send('Missing username or password');
  }

  const dataSource = await getDataSource();
  const userRepository = dataSource.getRepository(User);

  const existingUser = await userRepository.findOne({ where: { username }, select: ["id", "username", "passwordHash", "email", "publishOptions"] });

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

type UserPublishingOptions = { [key: string]: string | number | boolean };
type UserFontOptions = { [key: string]: EditorFont | number };

const maxUsernameLength = 20;

type UserPatch = {
  username?: string;
  publishOptions?: UserPublishingOptions;
  fontOptions?: UserFontOptions;
  newPassword?: string;
  newPasswordConfirm?: string;
  email?: string;
};

router.patch('/user', expressjwt(jwtProps), async (req: JWTRequest, res) => {
  /**
   * User id is taken from the JWT token, as users can only edit their own profile.
   * req.body should be an instance of UserPatch
   */

  const token = req.headers.authorization?.replace('Bearer ', '');

  try {
    jwt.verify(token || '', process.env.SECRET_KEY || '');
  } catch (err) {
    return res.status(401).send('Invalid token');
  }

  try {
    const dataSource = await getDataSource();
    const userRepository = dataSource.getRepository(User);

    const user = await userRepository.findOne(
      { 
        select: ['id', 'username', 'email', 'publishOptions', 'fontOptions'],
        where: { id: req.auth?.id } 
      });

    if (!user || user.id !== req.auth?.id) {
      return res.status(404).send('User not found.');
    }

    const checkIsEmail = (str: string) => {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
    }
    
    const { username, publishOptions, fontOptions, newPassword, newPasswordConfirm, email } = req.body as UserPatch;

    if (!username && !publishOptions && !newPassword && !newPasswordConfirm && !email && !fontOptions) {
      return res.status(400).send('No information sent.');
    }

    const updates:string[] = [];

    if (username && username !== user.username) {
      // Check if username is already taken
      const existingUsername = await userRepository.findOne({ where: { username } });

      if (existingUsername) {
        return res.status(409).send('Username is already taken.');
      }

      // Check username length
      if (username.length > maxUsernameLength) {
        return res.status(400).send(`Username cannot be longer than ${maxUsernameLength} characters.`);
      }

      // Check if username is an email address.  If so, it will be exempt from the alphanumeric check.
      const isEmail = checkIsEmail(username);

      // Only allow alphanumeric characters, dashes, underscores, periods and spaces, unless it is an email address
      if (!/^[a-zA-Z0-9-_ .]+$/.test(username) && !isEmail) {
        return res.status(400).send('Username can only contain alphanumeric characters, dashes, underscores, periods and spaces.');
      }

      updates.push(`New username: ${username}`);
      user.username = username;
    }

    if (email && email !== user.email) {
      // Check if email is already taken
      const existingEmail = await userRepository.findOne({ where: { email } });

      if (existingEmail) {
        return res.status(409).send('E-mail address is already in use.');
      }

      // Check if email address is valid
      if (!checkIsEmail(email)) {
        return res.status(400).send('Invalid e-mail address.');
      }

      updates.push(`New e-mail address: ${email}`);
      user.email = email;
    }

    if (publishOptions) {
      user.publishOptions = publishOptions;
    }

    if (fontOptions) {
      user.fontOptions = fontOptions;
    }

    if (newPassword) {
      if (!newPasswordConfirm) {
        return res.status(400).send('Missing password confirmation.');
      }

      if (newPassword !== newPasswordConfirm) {
        return res.status(400).send('New password and confirmation do not match.');
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);

      updates.push('Password changed.');
      user.passwordHash = passwordHash;
    }

    await userRepository.save(user);

    return res.status(200).send({
      id: user.id,
      username: user.username,
      email: user.email,
      publishOptions: user.publishOptions,
      fontOptions: user.fontOptions,
        // Signing a JWT using the secret key from the environment variables
      token: jwt.sign({ id: user.id, username: user.username }, process.env.SECRET_KEY as string, { expiresIn: '720h' })
    });

  } catch (error) {
    if (error instanceof QueryFailedError) {
      return res.status(500).send(`Database Query Failed: ${error.message}`);
    } else if (error instanceof Error) {
      return res.status(400).send(error.message);
    }
  }
});

router.post('/user/editing', expressjwt(jwtProps), async (req: JWTRequest, res) => {
  try {
    // Accepts an array of file ids and a project id

    const fileIds = req.body.fileIds as number[];

    // Check for authenticated user

    const token = req.headers.authorization?.replace('Bearer ', '');

    jwt.verify(token || '', process.env.SECRET_KEY || '');

    const userId = req.auth?.id as number;

    const dataSource = await getDataSource();
    const userRepository = dataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: userId }, select: ["id", "username", "passwordHash", "email", "publishOptions"] });

    if (!user) {
      return res.status(404).send('User not found.');
    }

    // Check for existence of project
    const projectId = req.body.projectId ? req.body.ProjectId as number : null;
    const projectRepository = dataSource.getRepository(Project);

    if (projectId) {
      const project = await projectRepository.findOne({
        where: { id: projectId },
        relations: ["creator", "collaborators"],
        select: ["id", "creator", "collaborators"]
      });

      if (!project) {
        return res.status(404).send('Project not found.');
      }

      // Check for user auth on project (creator or collaborator)

      if (project.creator.id !== userId && !project.collaborators?.find((collaborator:User) => collaborator.id === userId)) {
        return res.status(401).send('User is not authorized to edit this project.');
      }
    }
    // Check for existence of files
    const fileRepository = dataSource.getRepository(File);

    const files = await fileRepository.find({
      select: ["id", "lastEditing", "lastActive"],
      relations: ["lastEditing"],
      where: {
        id: In<number>(fileIds || []),
        project: { id: projectId || undefined }
      }
      });

    // Update the following fields on File:
      // lastEditing: User
      // lastActive: Date

    const updateFileEditing = async (file:File, user:User) => {
      file.lastEditing = user;
      file.lastActive = new Date();
      await fileRepository.save(file);
    };

    const clearFileEditing = async (file:File) => {
      file.lastEditing = undefined;
      file.lastActive = undefined;
      await fileRepository.save(file);
    }

    await Promise.all(files.map(file => updateFileEditing(file, user)));

    // For files with this project id that are not in the array of file ids, set:
      // lastEditing: null
      // lastActive: null

    const filesLeftOut = await fileRepository.findBy({
      project: projectId? { id: projectId } : undefined,
      lastEditing: { id: userId },
      id: Not(In<number>(fileIds || []))
    });

    await Promise.all(filesLeftOut.map(file => clearFileEditing(file)));

    return res.status(200).send('Editing status updated.');

  } catch (error) {
    if (error instanceof QueryFailedError) {
      return res.status(500).send(`Database Query Failed: ${error.message}`);
    } else if (error instanceof Error) {
      return res.status(400).send(error.message);
    }
  }
});

export default router;
