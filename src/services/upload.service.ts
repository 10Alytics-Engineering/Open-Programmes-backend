import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../utils/s3-config";

const expiresIn = 60 * 60 * 24;

export const generateSignedFileUrl = async (key: string) => {
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: key,
  });

  return getSignedUrl(s3, command, {
    expiresIn,
  });
};

export const generateSignedDownloadUrl = async (
  key: string,
  fileName = "file",
) => {
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${fileName}"`,
  });

  return getSignedUrl(s3, command, {
    expiresIn,
  });
};

type AnyRecord = Record<string, any>;

export const attachSignedUrls = async <T extends AnyRecord>({
  items,
  keyField,
  urlField = "fileUrl",
}: {
  items: T[];
  keyField: keyof T;
  urlField?: string;
}) => {
  return Promise.all(
    items.map(async (item) => {
      const key = item[keyField];

      return {
        ...item,
        [urlField]: key
          ? await generateSignedFileUrl(String(key))
          : item[urlField] || null,
      };
    }),
  );
};

export const attachSignedUrlsToNested = async <T extends Record<string, any>>(
  items: T[],
  relationKey: keyof T,
  keyField = "key",
  urlField = "url",
) => {
  return Promise.all(
    items.map(async (item) => {
      const relationItems = item[relationKey];

      if (!Array.isArray(relationItems)) {
        return item;
      }

      const updatedRelationItems = await Promise.all(
        relationItems.map(async (relationItem: any) => ({
          ...relationItem,
          [urlField]:
            relationItem[urlField] ||
            (relationItem[keyField]
              ? await generateSignedFileUrl(relationItem[keyField])
              : null),
        })),
      );

      return {
        ...item,
        [relationKey]: updatedRelationItems,
      };
    }),
  );
};
