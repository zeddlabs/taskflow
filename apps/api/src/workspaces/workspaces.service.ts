import { Injectable, NotFoundException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { AuthConfig } from "../auth/auth.config";
import { DatabaseService } from "../database.service";
import { InvalidDtoException } from "../http/problem-details";
import {
  WorkspaceListQuery,
  WorkspacePage,
  WorkspaceSummary,
} from "./workspaces.dto";

const membershipSelect = {
  role: true,
  workspace: { select: { id: true, name: true, slug: true } },
} as const;

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: AuthConfig,
  ) {}

  private cursor(userId: string, workspaceId: string) {
    const key = Buffer.from(workspaceId).toString("base64url");
    const mac = createHmac("sha256", this.config.secret)
      .update(JSON.stringify(["workspace-list-v1", userId, key]))
      .digest("base64url");
    return key + "." + mac;
  }

  private after(userId: string, cursor: string) {
    const id = Buffer.from(cursor.split(".")[0], "base64url").toString();
    const expected = Buffer.from(this.cursor(userId, id));
    const supplied = Buffer.from(cursor);
    if (
      !id ||
      expected.length !== supplied.length ||
      !timingSafeEqual(expected, supplied)
    )
      throw new InvalidDtoException();
    return id;
  }

  async list(
    userId: string,
    query: WorkspaceListQuery,
  ): Promise<WorkspacePage> {
    const after =
      query.cursor === undefined ? undefined : this.after(userId, query.cursor);
    const rows = await this.db.workspaceMember.findMany({
      where: {
        userId,
        workspace: { archivedAt: null },
        workspaceId: { gt: after },
      },
      orderBy: { workspaceId: "asc" },
      take: query.limit + 1,
      select: membershipSelect,
    });
    const hasNextPage = rows.length > query.limit;
    const data = rows
      .slice(0, query.limit)
      .map(({ workspace, role }) => ({ ...workspace, myRole: role }));
    return {
      data,
      pageInfo: {
        hasNextPage,
        nextCursor: hasNextPage
          ? this.cursor(userId, data[data.length - 1].id)
          : null,
      },
    };
  }

  async detail(userId: string, workspaceId: string): Promise<WorkspaceSummary> {
    const row = await this.db.workspaceMember.findFirst({
      where: { workspaceId, userId, workspace: { archivedAt: null } },
      select: membershipSelect,
    });
    if (!row) throw new NotFoundException();
    return { ...row.workspace, myRole: row.role };
  }
}
