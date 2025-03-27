const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const axios = require("axios");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "http://localhost:5173" }, // Adjust if frontend URL changes
});

app.use(cors());

const packageData = {}; // Stores package details for each tracked package
let currentpackage = null;

const fetchPackageStats = async (packageName) => {
  try {
    const url = `https://api.npmjs.org/downloads/point/last-day/${packageName}`;
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error("Error fetching package data:", error.message);
    return null;
  }
};

const fetchdetails = async (packageName) => {
  try {
    const url = `https://registry.npmjs.org/${packageName}`;
    const response = await axios.get(url);
    return response.data;
    
  } catch (error) {
    console.error("Error fetching package details:", error.message);
    return null;
  }

}

const fetchscores = async (packageName) => {
  try {
    const url = `https://api.npms.io/v2/package/${packageName}`;
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error("Error fetching package scores:", error.message);
    return null;
  }
};

const fetchWeeklyDownloads = async (packageName) => {
  try {
    const url = `https://api.npmjs.org/downloads/point/last-week/${packageName}`;
    const response = await axios.get(url);
    return response.data.downloads;
  } catch (error) {
    console.error("Error fetching weekly downloads:", error.message);
    return null;
  }
};

const fetchTotalDownloads = async (packageName) => {
  try {
    // Using a fixed date range starting from 2015-01-01 to current date
    const startDate = "2015-01-01";
    const endDate = new Date().toISOString().split("T")[0];
    const url = `https://api.npmjs.org/downloads/range/${startDate}:${endDate}/${packageName}`;
    const response = await axios.get(url);
    if (response.data && response.data.downloads) {
      const total = response.data.downloads.reduce((acc, item) => acc + item.downloads, 0);
      return total;
    }
    return null;
  } catch (error) {
    console.error("Error fetching total downloads:", error.message);
    return null;
  }
};

io.on("connection", (socket) => {
  console.log("Client connected");


  socket.on("trackPackage", async (packageName) => {
    console.log(`Tracking package: ${packageName}`);

    if (!packageData[packageName]) {
      currentpackage = null; 
      
      const data = await fetchPackageStats(packageName);
      const data2 = await fetchscores(packageName);
      const weeklyDownloads = await fetchWeeklyDownloads(packageName);
      const totalDownloads = await fetchTotalDownloads(packageName);
      const details = await fetchdetails(packageName);

      if (data && data2) {
        const { popularity, quality, maintenance } = data2.score.detail;
        const metadata = data2.collected.metadata;
        const rate = data.downloads / 86400; // downloads per second based on last-day stats
        packageData[packageName] = {
          baseDownloads: data.downloads, // starting point for daily downloads
          currentDownloads: data.downloads,
          baseWeeklyDownloads: weeklyDownloads,
          weeklyDownloads: weeklyDownloads,
          baseTotalDownloads: totalDownloads,
          totalDownloads: totalDownloads,
          rate,
          lastUpdated: Date.now(),
          popularity,
          quality,
          maintenance,
          description: metadata.description,
          lastPublished: details.time.modified,
          license: metadata.license,
          currentVersion: details["dist-tags"].latest,
          maintainers: metadata.maintainers,
          repository: metadata.links.repository,
          versions: details.versions
          
        };
        // console.log(packageData[packageName]);
        console.log(packageData)
        currentpackage = packageData[packageName];
        // console.log(details.versions)
        // console.log(currentpackage);

      }
    }

    const interval = setInterval(() => {
      if (currentpackage) {
        const elapsedSeconds = (Date.now() - currentpackage.lastUpdated) / 10000;
        const delta = currentpackage.rate * elapsedSeconds;
        currentpackage.currentDownloads += delta;
        currentpackage.weeklyDownloads += delta;
        currentpackage.totalDownloads += delta;
        currentpackage.lastUpdated = Date.now();

        socket.emit("packageUpdate", {
          package: currentpackage,
          estimatedDownloads: Math.floor(currentpackage.currentDownloads),
          baseDownloads: currentpackage.baseDownloads,
          popularity: currentpackage.popularity,
          quality: currentpackage.quality,
          maintenance: currentpackage.maintenance,
          description: currentpackage.description,
          lastPublished: currentpackage.lastPublished,
          license:currentpackage.license,
          currentVersion: currentpackage.currentVersion,
          maintainers: currentpackage.maintainers,
          repository: currentpackage.repository,
          weeklyDownloads: Math.floor(currentpackage.weeklyDownloads),
          totalDownloads: Math.floor(currentpackage.totalDownloads),
          versions: currentpackage.versions
        });
      }
    }, 1000);

    socket.on("disconnect", () => {
      clearInterval(interval);
      console.log("Client disconnected");
    });
  });
});
const port = process.env.PORT || 5000;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
