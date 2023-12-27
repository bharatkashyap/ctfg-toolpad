import { Upload } from "@aws-sdk/lib-storage";
import { S3 } from "@aws-sdk/client-s3";
import Airtable from "airtable";
import { promises as fs } from "fs";

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
const uploadToS3 = async (airtableListingId, airtableUploadedImages) => {
  try {
    // Read secrets from the encrypted file
    if (
      !process.env.AWS_ACCESS_KEY_ID ||
      !process.env.AWS_SECRET_ACCESS_KEY ||
      !process.env.AWS_REGION ||
      !process.env.AWS_S3_BUCKET
    ) {
      throw new Error("AWS Credebntials not available.");
    }

    // Configure AWS SDK with the acquired information
    const s3 = new S3({
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
      region: process.env.AWS_REGION,
    });

    const uploadPromises = airtableUploadedImages.map(async (image) => {
      // Download image from URL
      await downloadImage(image.url, image.id);

      // Upload to S3
      const fileContent = await fs.readFile(image.id);
      const s3Key = `screenshots/${airtableListingId}/${image.id}`;
      const params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: s3Key,
        Body: fileContent,
      };

      const response = await new Upload({
        client: s3,
        params,
      }).done();

      console.info(
        "Image uploaded successfully:",
        process.env.AWS_S3_BUCKET,
        process.env.AWS_REGION,
        response.Key
      );

      return `https://s3.${process.env.AWS_REGION}.amazonaws.com/${process.env.AWS_S3_BUCKET}/${s3Key}`;
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

// Call the uploadToS3 function
export default async function handler(
  airtableListingId: string,
  airtableUploadedImages: any
) {
  const urls = await uploadToS3(airtableListingId, airtableUploadedImages);
  await uploadToAirtable(airtableListingId, urls);
}
