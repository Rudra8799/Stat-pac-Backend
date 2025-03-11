const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const axios = require("axios");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "http://localhost:5174" }, // Adjust if frontend URL changes
});

app.use(cors());

const packageData = {}; // Stores package details for each tracked package

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
      const data = await fetchPackageStats(packageName);
      const data2 = await fetchscores(packageName);
      const weeklyDownloads = await fetchWeeklyDownloads(packageName);
      const totalDownloads = await fetchTotalDownloads(packageName);

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
          lastPublished: metadata.date,
          license: metadata.license,
          currentVersion: metadata.version,
          maintainers: metadata.maintainers,
          repository: metadata.links.repository,
        };
        console.log(packageData[packageName]);
      }
    }

    const interval = setInterval(() => {
      if (packageData[packageName]) {
        const elapsedSeconds = (Date.now() - packageData[packageName].lastUpdated) / 1000;
        const delta = packageData[packageName].rate * elapsedSeconds;
        packageData[packageName].currentDownloads += delta;
        packageData[packageName].weeklyDownloads += delta;
        packageData[packageName].totalDownloads += delta;
        packageData[packageName].lastUpdated = Date.now();

        socket.emit("packageUpdate", {
          package: packageName,
          estimatedDownloads: Math.floor(packageData[packageName].currentDownloads),
          baseDownloads: packageData[packageName].baseDownloads,
          popularity: packageData[packageName].popularity,
          quality: packageData[packageName].quality,
          maintenance: packageData[packageName].maintenance,
          description: packageData[packageName].description,
          lastPublished: packageData[packageName].lastPublished,
          license: packageData[packageName].license,
          currentVersion: packageData[packageName].currentVersion,
          maintainers: packageData[packageName].maintainers,
          repository: packageData[packageName].repository,
          weeklyDownloads: Math.floor(packageData[packageName].weeklyDownloads),
          totalDownloads: Math.floor(packageData[packageName].totalDownloads),
        });
      }
    }, 1000);

    socket.on("disconnect", () => {
      clearInterval(interval);
      console.log("Client disconnected");
    });
  });
});

server.listen(5000, () => {
  console.log("Server running on port 5000");
});
