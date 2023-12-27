import { Upload } from "@aws-sdk/lib-storage";
import { S3 } from "@aws-sdk/client-s3";
import Airtable from "airtable";
import { promises as fs } from "fs";
import { promisify } from "util";
import { exec } from "child_process";

// Function to download an image from a URL using native fetch
const downloadImage = async (url, localPath) => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download image. Status: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  await fs.writeFile(localPath, Buffer.from(buffer));
};

// Function to upload a file to S3
const uploadToS3 = async (
  airtableListingId,
  airtableUploadedImages,
  secretsFilePath,
  passphraseFilePath
) => {
  try {
    // Read secrets from the encrypted file
    const secrets = await readSecretsFromFile(
      secretsFilePath,
      passphraseFilePath
    );

    // Configure AWS SDK with the acquired information
    const s3 = new S3({
      credentials: {
        accessKeyId: secrets.AWS_ACCESS_KEY_ID,
        secretAccessKey: secrets.AWS_SECRET_ACCESS_KEY,
      },

      region: secrets.AWS_REGION,
    });

    const uploadPromises = airtableUploadedImages.map(async (image) => {
      // Download image from URL
      await downloadImage(image.url, image.id);

      // Upload to S3
      const fileContent = await fs.readFile(image.id);
      const s3Key = `screenshots/${airtableListingId}/${image.id}`;
      const params = {
        Bucket: secrets.AWS_S3_BUCKET,
        Key: s3Key,
        Body: fileContent,
      };

      const response = await new Upload({
        client: s3,
        params,
      }).done();

      console.info(
        "Image uploaded successfully:",
        secrets.AWS_S3_BUCKET,
        secrets.AWS_REGION,
        response.Key
      );

      return `https://s3.${secrets.AWS_REGION}.amazonaws.com/${secrets.AWS_S3_BUCKET}/${s3Key}`;
    });
    const uploadedImageUrls = await Promise.all(uploadPromises);
    return uploadedImageUrls;
  } catch (error) {
    console.error("Error:", error);
  } finally {
    // Cleanup: Delete the local image files

    for (let image of airtableUploadedImages) {
      try {
        await fs.unlink(image.id);
        console.info(`Local file ${image.id} deleted successfully.`);
      } catch (deleteError) {
        console.error("Error deleting local file:", deleteError);
      }
    }
  }
};

// Function to read secrets from an encrypted file and return the config
const readSecretsFromFile = async (secretsFilePath, passphraseFilePath) => {
  try {
    const execPromise = promisify(exec);

    if (!passphraseFilePath) {
      throw new Error("Passphrase not available.");
    }
    const decryptCommand = `openssl enc -d -aes-256-cbc -in ${secretsFilePath} -pass file:${passphraseFilePath}`;
    const { stdout, stderr } = await execPromise(decryptCommand);

    if (stderr) {
      console.error(`Error reading secrets: ${stderr}`);
      return;
    }

    // Split and convert to JSON
    let keyValuePairs: string[][] = [];
    const lines = stdout.split("\n");
    for (const line of lines) {
      if (line.trim() === "") continue; // Skip empty lines
      const keyValuePair = line.split("=").map((pair) => pair.trim());
      keyValuePairs.push(keyValuePair);
    }

    const secrets = Object.fromEntries(keyValuePairs);
    console.log("Secrets", secrets, "secrets");
    return secrets;
  } catch (error) {
    console.error("Error reading secrets:", error);
    throw error;
  }
};

const uploadToAirtable = async (airtableListingId, urls) => {
  try {
    const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base(
      process.env.AIRTABLE_BASE || "defaultBase"
    );

    const uploadRequestArray = urls.map((url) => ({
      fields: {
        File: [
          {
            url: url,
          },
        ],
        Link: url,
        Listings: [airtableListingId],
      },
    }));

    const response = await base("Media").create(uploadRequestArray);
    console.info("Airtable updated successfully:", response);
  } catch (error) {
    console.error("Error updating Airtable:", error);
  }
};

const encryptedSecretsFilePath = process.env.CTFG_SECRETS_FILE || "secrets.txt";
const passphraseFilePath =
  process.env.CTFG_PASSPHRASE_FILE || "defaultPassphraseFilePath.txt";

// Call the uploadToS3 function
export default async function handler(
  airtableListingId: string,
  airtableUploadedImages: any
) {
  const urls = await uploadToS3(
    airtableListingId,
    airtableUploadedImages,
    encryptedSecretsFilePath,
    passphraseFilePath
  );
  await uploadToAirtable(airtableListingId, urls);
}

export async function getScreenshotUrl(websiteUrl: string) {
  const crypto = require("crypto");
  const secrets = await readSecretsFromFile(
    encryptedSecretsFilePath,
    passphraseFilePath
  );

  let params = `url=${websiteUrl}&delay=5`;
  let hash = crypto
    .createHash("md5")
    .update(secrets.TECHULUS_SECRET + params)
    .digest("hex");
  let result_img_url = `${secrets.TECHULUS_API_URL}${secrets.TECHULUS_API_KEY}/${hash}/image?${params}`;

  return result_img_url;
}

export async function screenshotUploader(
  airtableListingId: string,
  imageUrl: string,
  websiteUrl: string
) {
  const url = await uploadToS3(
    airtableListingId,
    [{ url: imageUrl, id: websiteUrl }],
    encryptedSecretsFilePath,
    passphraseFilePath
  );
  await uploadToAirtable(airtableListingId, url);
}
