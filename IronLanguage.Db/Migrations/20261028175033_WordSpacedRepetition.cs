using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IronLanguage.Db.Migrations
{
    /// <inheritdoc />
    public partial class WordSpacedRepetition : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WordReviewRewards",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    WordId = table.Column<Guid>(type: "uuid", nullable: false),
                    Day = table.Column<DateOnly>(type: "date", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WordReviewRewards", x => new { x.UserId, x.Day, x.WordId });
                    table.ForeignKey(
                        name: "FK_WordReviewRewards_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WordReviewSessions",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Mode = table.Column<string>(type: "text", nullable: false),
                    Format = table.Column<string>(type: "text", nullable: false),
                    ItemsJson = table.Column<string>(type: "text", nullable: false),
                    Index = table.Column<int>(type: "integer", nullable: false),
                    Revealed = table.Column<bool>(type: "boolean", nullable: false),
                    ResultJson = table.Column<string>(type: "text", nullable: true),
                    Correct = table.Column<int>(type: "integer", nullable: false),
                    Errors = table.Column<int>(type: "integer", nullable: false),
                    Skipped = table.Column<int>(type: "integer", nullable: false),
                    Points = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WordReviewSessions", x => x.UserId);
                    table.ForeignKey(
                        name: "FK_WordReviewSessions_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WordReviewSettings",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Format = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    DirectInput = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WordReviewSettings", x => x.UserId);
                    table.ForeignKey(
                        name: "FK_WordReviewSettings_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WordReviewStates",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    WordId = table.Column<Guid>(type: "uuid", nullable: false),
                    Reverse = table.Column<bool>(type: "boolean", nullable: false),
                    Stage = table.Column<int>(type: "integer", nullable: false),
                    DueAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ChoiceDays = table.Column<int>(type: "integer", nullable: false),
                    LastChoiceDay = table.Column<DateOnly>(type: "date", nullable: true),
                    Errors = table.Column<int>(type: "integer", nullable: false),
                    Mastered = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WordReviewStates", x => new { x.UserId, x.WordId, x.Reverse });
                    table.ForeignKey(
                        name: "FK_WordReviewStates_SavedWords_UserId_WordId",
                        columns: x => new { x.UserId, x.WordId },
                        principalTable: "SavedWords",
                        principalColumns: new[] { "UserId", "WordId" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WordReviewSessions_Id",
                table: "WordReviewSessions",
                column: "Id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WordReviewStates_UserId_DueAt",
                table: "WordReviewStates",
                columns: new[] { "UserId", "DueAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WordReviewRewards");

            migrationBuilder.DropTable(
                name: "WordReviewSessions");

            migrationBuilder.DropTable(
                name: "WordReviewSettings");

            migrationBuilder.DropTable(
                name: "WordReviewStates");
        }
    }
}
