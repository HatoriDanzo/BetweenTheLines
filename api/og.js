const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

module.exports = async (req, res) => {
  try {
    const svgPath = path.join(process.cwd(), "public", "og-image.svg");
    const svgBuffer = fs.readFileSync(svgPath);

    const png = await sharp(svgBuffer)
      .resize(1200, 630)
      .png()
      .toBuffer();

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    res.send(png);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error generating image");
  }
};
