using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IronLanguage.Db.Migrations
{
    /// <inheritdoc />
    public partial class DailyWordle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WordleGames",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Day = table.Column<DateOnly>(type: "date", nullable: false),
                    ExpectedWord = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: false),
                    Russian = table.Column<string>(type: "character varying(250)", maxLength: 250, nullable: false),
                    GuessesJson = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: false),
                    Revision = table.Column<int>(type: "integer", nullable: false),
                    Won = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WordleGames", x => new { x.UserId, x.Day });
                    table.ForeignKey(
                        name: "FK_WordleGames_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WordleGames");
        }
    }
}
