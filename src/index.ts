import 'reflect-metadata';
import 'dotenv/config';
import express from 'express';
import { getDataSource } from './database';
import userRoutes from './routes/users';
import projectRoutes from './routes/projects';

// Get connection to DB
const dataSource = getDataSource();

// Once the connection is established, we initialize the Express app
dataSource.then(() => {
  const app = express();

  app.use(express.json()); // for parsing application/json
  app.use('/', userRoutes);  // <-- updated this line
  app.use('/', projectRoutes);  // <-- updated this line

  // Use the command line argument for the port number if it exists, otherwise default to 3000
  const port = process.argv[2] || 3000;

  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}).catch((error:any) => console.log("Error: ", error));
