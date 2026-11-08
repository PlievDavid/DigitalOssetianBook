using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IronLanguage.Db.Migrations
{
    /// <inheritdoc />
    public partial class CourseVersionFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CourseEnrollments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CourseId = table.Column<Guid>(type: "uuid", nullable: false),
                    VersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CourseEnrollments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CourseEnrollments_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Courses",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Archived = table.Column<bool>(type: "boolean", nullable: false),
                    PublishedVersionId = table.Column<Guid>(type: "uuid", nullable: true),
                    DraftStamp = table.Column<long>(type: "bigint", nullable: false),
                    DraftJson = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Courses", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Courses_Users_OwnerId",
                        column: x => x.OwnerId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CourseVersions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CourseId = table.Column<Guid>(type: "uuid", nullable: false),
                    Number = table.Column<int>(type: "integer", nullable: false),
                    SourceDraftStamp = table.Column<long>(type: "bigint", nullable: false),
                    SnapshotJson = table.Column<string>(type: "text", nullable: false),
                    PublishedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CourseVersions", x => x.Id);
                    table.UniqueConstraint("AK_CourseVersions_Id_CourseId", x => new { x.Id, x.CourseId });
                    table.ForeignKey(
                        name: "FK_CourseVersions_Courses_CourseId",
                        column: x => x.CourseId,
                        principalTable: "Courses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CourseEnrollments_UserId_CourseId",
                table: "CourseEnrollments",
                columns: new[] { "UserId", "CourseId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CourseEnrollments_VersionId_CourseId",
                table: "CourseEnrollments",
                columns: new[] { "VersionId", "CourseId" });

            migrationBuilder.CreateIndex(
                name: "IX_Courses_OwnerId",
                table: "Courses",
                column: "OwnerId");

            migrationBuilder.CreateIndex(
                name: "IX_Courses_PublishedVersionId_Id",
                table: "Courses",
                columns: new[] { "PublishedVersionId", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_CourseVersions_CourseId_Number",
                table: "CourseVersions",
                columns: new[] { "CourseId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CourseVersions_CourseId_SourceDraftStamp",
                table: "CourseVersions",
                columns: new[] { "CourseId", "SourceDraftStamp" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_CourseEnrollments_CourseVersions_VersionId_CourseId",
                table: "CourseEnrollments",
                columns: new[] { "VersionId", "CourseId" },
                principalTable: "CourseVersions",
                principalColumns: new[] { "Id", "CourseId" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Courses_CourseVersions_PublishedVersionId_Id",
                table: "Courses",
                columns: new[] { "PublishedVersionId", "Id" },
                principalTable: "CourseVersions",
                principalColumns: new[] { "Id", "CourseId" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Courses_CourseVersions_PublishedVersionId_Id",
                table: "Courses");

            migrationBuilder.DropTable(
                name: "CourseEnrollments");

            migrationBuilder.DropTable(
                name: "CourseVersions");

            migrationBuilder.DropTable(
                name: "Courses");
        }
    }
}
