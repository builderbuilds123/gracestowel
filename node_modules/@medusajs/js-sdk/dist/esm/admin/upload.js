var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export class Upload {
    /**
     * @ignore
     */
    constructor(client) {
        this.client = client;
    }
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
    create(body, query, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            const form = new FormData();
            if (body instanceof FileList) {
                Array.from(body).forEach((file) => {
                    form.append("files", file);
                });
            }
            else {
                body.files.forEach((file) => {
                    form.append("files", "content" in file
                        ? new Blob([file.content], {
                            type: "text/plain",
                        })
                        : file, file.name);
                });
            }
            return this.client.fetch(`/admin/uploads`, {
                method: "POST",
                headers: Object.assign(Object.assign({}, headers), { 
                    // Let the browser determine the content type.
                    "content-type": null }),
                body: form,
                query,
            });
        });
    }
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
    retrieve(id, query, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.client.fetch(`/admin/uploads/${id}`, {
                query,
                headers,
            });
        });
    }
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
    delete(id, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.client.fetch(`/admin/uploads/${id}`, {
                method: "DELETE",
                headers,
            });
        });
    }
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
    presignedUrl(body, query, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.client.fetch(`/admin/uploads/presigned-urls`, {
                method: "POST",
                headers,
                body,
                query,
            });
        });
    }
}
//# sourceMappingURL=upload.js.map