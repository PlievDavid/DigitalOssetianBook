using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IronLanguage.Db.Migrations
{
    /// <inheritdoc />
    public partial class DialogueSessionRevision : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Revision",
                table: "DialogueSessions",
                type: "integer",
                nullable: false,
                defaultValue: 1);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Revision",
                table: "DialogueSessions");
        }
    }
}
