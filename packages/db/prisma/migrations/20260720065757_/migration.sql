-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('CLICK', 'DBLCLICK', 'RIGHTCLICK', 'KEYDOWN', 'KEYUP', 'TYPE', 'SCROLL', 'HOVER', 'DRAG', 'DROP', 'UPLOAD', 'DOWNLOAD', 'SELECT', 'CHECK', 'UNCHECK', 'NAVIGATE', 'BACK', 'FORWARD', 'REFRESH', 'NEWTAB', 'CLOSETAB', 'SWITCHTAB', 'WAIT', 'SCREENSHOT', 'COPY', 'EXTRACT');

-- CreateEnum
CREATE TYPE "VariableType" AS ENUM ('EMAIL', 'PASSWORD', 'SEARCH', 'TEXT', 'NUMBER', 'URL');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Variable" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "exampleValue" TEXT,
    "type" "VariableType" NOT NULL,
    "description" TEXT,
    "workflowId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Variable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Step" (
    "id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "action" "ActionType" NOT NULL,
    "payload" JSONB,
    "selectors" JSONB,
    "url" TEXT,
    "title" TEXT,
    "tabId" TEXT,
    "timestamp" TIMESTAMP(3),
    "screenshotBefore" TEXT,
    "screenshotAfter" TEXT,
    "workflowId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordingSession" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "workflowId" TEXT,

    CONSTRAINT "RecordingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Workflow_status_idx" ON "Workflow"("status");

-- CreateIndex
CREATE INDEX "Variable_workflowId_idx" ON "Variable"("workflowId");

-- CreateIndex
CREATE INDEX "Step_workflowId_idx" ON "Step"("workflowId");

-- CreateIndex
CREATE INDEX "RecordingSession_workflowId_idx" ON "RecordingSession"("workflowId");

-- AddForeignKey
ALTER TABLE "Variable" ADD CONSTRAINT "Variable_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Step" ADD CONSTRAINT "Step_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingSession" ADD CONSTRAINT "RecordingSession_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
