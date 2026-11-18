using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IronLanguage.Db.Migrations
{
    /// <inheritdoc />
    public partial class ReusableLessonLibrary : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "LibraryLessons",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceCourseId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceLessonId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceStamp = table.Column<long>(type: "bigint", nullable: false),
                    LessonJson = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LibraryLessons", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LibraryLessons_Users_OwnerId",
                        column: x => x.OwnerId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_LibraryLessons_OwnerId_SourceCourseId_SourceLessonId_Source~",
                table: "LibraryLessons",
                columns: new[] { "OwnerId", "SourceCourseId", "SourceLessonId", "SourceStamp" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LibraryLessons");
        }
    }
}
