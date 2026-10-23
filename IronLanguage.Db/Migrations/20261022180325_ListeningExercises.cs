using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IronLanguage.Db.Migrations
{
    /// <inheritdoc />
    public partial class ListeningExercises : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CorrectOption",
                table: "Exercises",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "OptionsJson",
                table: "Exercises",
                type: "text",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.AddColumn<string>(
                name: "Transcript",
                table: "Exercises",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "CorrectOption",
                table: "Attempts",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "OptionsJson",
                table: "Attempts",
                type: "text",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.AddColumn<string>(
                name: "Transcript",
                table: "Attempts",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CorrectOption",
                table: "Exercises");

            migrationBuilder.DropColumn(
                name: "OptionsJson",
                table: "Exercises");

            migrationBuilder.DropColumn(
                name: "Transcript",
                table: "Exercises");

            migrationBuilder.DropColumn(
                name: "CorrectOption",
                table: "Attempts");

            migrationBuilder.DropColumn(
                name: "OptionsJson",
                table: "Attempts");

            migrationBuilder.DropColumn(
                name: "Transcript",
                table: "Attempts");
        }
    }
}
