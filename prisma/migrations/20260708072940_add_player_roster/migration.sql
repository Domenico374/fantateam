-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ruolo" TEXT NOT NULL,
    "squadraSerieA" TEXT NOT NULL,
    "costo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterEntry" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RosterEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Player_ruolo_idx" ON "Player"("ruolo");

-- CreateIndex
CREATE INDEX "Player_squadraSerieA_idx" ON "Player"("squadraSerieA");

-- CreateIndex
CREATE INDEX "RosterEntry_playerId_idx" ON "RosterEntry"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "RosterEntry_teamId_playerId_key" ON "RosterEntry"("teamId", "playerId");

-- AddForeignKey
ALTER TABLE "RosterEntry" ADD CONSTRAINT "RosterEntry_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterEntry" ADD CONSTRAINT "RosterEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
