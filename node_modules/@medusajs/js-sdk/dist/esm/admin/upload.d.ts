import { HttpTypes, SelectParams } from "@medusajs/types";
import { Client } from "../client";
import { ClientHeaders } from "../types";
export declare class Upload {
    /**
     * @ignore
     */
    private client;
    /**
     * @ignore
     */
    constructor(client: Client);
    /**
     * This method creates a new upload. It sends a request to the
     * [Upload Files](https://docs.medusajs.com/api/admin#uploads_postuploads)
     * API route.
     *
     * @param body - The details of the files to upload.
     * @param query - Configure the fields and relations to retrieve in the uploaded files.
     * @param headers - Headers to pass in the request.
     * @returns The upload files' details.
     *
     * @privateRemarks
     *
     * Note: The creation/upload flow be made more advanced, with support for streaming and progress, but for now we keep it simple
     *
     * @example
     * sdk.admin.upload.create(
     *   {
     *     files: [
     *        // file uploaded as a binary string
     *       {
     *         name: "test.txt",
     *         content: "test", // Should be the binary string of the file
     *       },
     *       // file uploaded as a File object
     *       new File(["test"], "test.txt", { type: "text/plain" })
     *     ],
     *   }
     * )
     * .then(({ files }) => {
     *   console.log(files)
     * })
     */
    create(body: HttpTypes.AdminUploadFile, query?: SelectParams, headers?: ClientHeaders): Promise<HttpTypes.AdminFileListResponse>;
    /**
     * This method retrieves a file's details by its ID. It sends a request to the
     * [Get File](https://docs.medusajs.com/api/admin#uploads_getuploadsid)
     * API route.
     *
     * @param id - The ID of the file to retrieve.
     * @param query - Query parameters to pass in the request.
     * @param headers - Headers to pass in the request.
     * @returns The file's details.
     *
     * @example
     * sdk.admin.upload.retrieve("test.txt")
     * .then(({ file }) => {
     *   console.log(file)
     * })
     */
    retrieve(id: string, query?: SelectParams, headers?: ClientHeaders): Promise<HttpTypes.AdminFileResponse>;
    /**
     * This method deletes a file by its ID from the configured File Module Provider. It sends a request to the
     * [Delete File](https://docs.medusajs.com/api/admin#uploads_deleteuploadsid)
     * API route.
     *
     * @param id - The ID of the file to delete.
     * @param headers - Headers to pass in the request.
     * @returns The deletion's details.
     *
     * @example
     * sdk.admin.upload.delete("test.txt")
     * .then(({ deleted }) => {
     *   console.log(deleted)
     * })
     */
    delete(id: string, headers?: ClientHeaders): Promise<HttpTypes.AdminFileDeleteResponse>;
    /**
     * This method creates a presigned URL for a file upload. It sends a request to the
     * `/admin/uploads/presigned-urls` API route.
     *
     * @param body - The details of the file to upload.
     * @param query - Query parameters to pass in the request.
     * @param headers - Headers to pass in the request.
     * @returns The presigned URL for the file upload.
     *
     * @example
     * sdk.admin.upload.presignedUrl({
     *   name: "test.txt",
     *   size: 1000,
     *   type: "text/plain",
     * }))
     */
    presignedUrl(body: HttpTypes.AdminUploadPreSignedUrlRequest, query?: SelectParams, headers?: ClientHeaders): Promise<HttpTypes.AdminUploadPreSignedUrlResponse>;
}
//# sourceMappingURL=upload.d.ts.map