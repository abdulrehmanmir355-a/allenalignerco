
CREATE TYPE "LargeUploadStatus" AS ENUM ('CREATED', 'UPLOADING', 'COMPLETED', 'CANCELLED', 'FAILED');
CREATE TABLE "LargeUploadSession" (
 "id" TEXT NOT NULL, "caseId" TEXT NOT NULL, "doctorId" TEXT NOT NULL, "clinicId" TEXT NOT NULL,
 "originalName" TEXT NOT NULL, "mime" TEXT NOT NULL, "totalBytes" INTEGER NOT NULL, "chunkSize" INTEGER NOT NULL, "totalChunks" INTEGER NOT NULL,
 "status" "LargeUploadStatus" NOT NULL DEFAULT 'CREATED', "expectedSha256" TEXT, "completedSha256" TEXT,
 "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "LargeUploadSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LargeUploadChunk" (
 "id" TEXT NOT NULL, "uploadId" TEXT NOT NULL, "chunkIndex" INTEGER NOT NULL, "sizeBytes" INTEGER NOT NULL, "sha256" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "LargeUploadChunk_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LargeClinicalFile" (
 "id" TEXT NOT NULL, "caseId" TEXT NOT NULL, "uploadedByDoctorId" TEXT NOT NULL, "originalName" TEXT NOT NULL, "mime" TEXT NOT NULL, "sizeBytes" INTEGER NOT NULL,
 "storageKey" TEXT NOT NULL, "sha256" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "LargeClinicalFile_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LargeUploadSession_caseId_status_idx" ON "LargeUploadSession"("caseId", "status");
CREATE INDEX "LargeUploadSession_doctorId_clinicId_idx" ON "LargeUploadSession"("doctorId", "clinicId");
CREATE INDEX "LargeUploadSession_expiresAt_idx" ON "LargeUploadSession"("expiresAt");
CREATE UNIQUE INDEX "LargeUploadChunk_uploadId_chunkIndex_key" ON "LargeUploadChunk"("uploadId", "chunkIndex");
CREATE UNIQUE INDEX "LargeClinicalFile_storageKey_key" ON "LargeClinicalFile"("storageKey");
CREATE UNIQUE INDEX "LargeClinicalFile_caseId_originalName_version_key" ON "LargeClinicalFile"("caseId", "originalName", "version");
CREATE INDEX "LargeClinicalFile_caseId_createdAt_idx" ON "LargeClinicalFile"("caseId", "createdAt");
ALTER TABLE "LargeUploadSession" ADD CONSTRAINT "LargeUploadSession_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "PortalCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LargeUploadChunk" ADD CONSTRAINT "LargeUploadChunk_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "LargeUploadSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LargeClinicalFile" ADD CONSTRAINT "LargeClinicalFile_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "PortalCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
