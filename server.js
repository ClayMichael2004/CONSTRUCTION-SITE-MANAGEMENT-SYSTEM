const express = require('express');
const cors= require('cors');
const dotenv= require('dotenv');
const authRoutes= require('./routes/authRoutes');
const secretaryRoutes= require('./routes/secretaryRoutes');
const siteRoutes = require('./routes/sites');
const rolesRoutes = require('./routes/roles');
const reportsRoutes=require("./routes/reports");
const managerRoutes=require('./routes/managerRoutes');
const db=require('./config/db');

dotenv.config();

const app=express();
app.use(cors());
app.use(express.json());
app.use((req, res, next)=>{
    req.db=db;
    next();
});

app.use(express.static('public'));


app.use('/api/auth', authRoutes);
app.use('/api/secretary',secretaryRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/roles', require("./routes/roles"));
app.use('/api/reports', reportsRoutes);
app.use("/api/manager", require("./routes/managerRoutes"));


const PORT = process.env.PORT || 5000;
app.listen(PORT, ()=> console.log(` Server running on port ${PORT}`));