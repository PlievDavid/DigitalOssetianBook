--
-- PostgreSQL database dump
--

\restrict RkpYty4XtxkrTn2amwqLEDvmhz6Pq4iSwncqRHXZ522056FLfViJSP343cfV2bV

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Achievements" (
    "UserId" uuid NOT NULL,
    "Code" text NOT NULL,
    "AwardedAt" timestamp with time zone NOT NULL
);


--
-- Name: Attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Attempts" (
    "Id" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "ExerciseId" uuid NOT NULL,
    "ExerciseVersion" integer NOT NULL,
    "ExpectedAnswer" text NOT NULL,
    "AlternativesJson" text NOT NULL,
    "StartedAt" timestamp with time zone NOT NULL,
    "CompletedAt" timestamp with time zone,
    "SubmittedAnswer" text,
    "Correct" boolean,
    "DraftIndicesJson" text DEFAULT ''::text NOT NULL,
    "AudioPath" text,
    "Explanation" text DEFAULT ''::text NOT NULL,
    "RussianPrompt" text DEFAULT ''::text NOT NULL,
    "TokensJson" text DEFAULT ''::text NOT NULL,
    "WordIdsJson" text DEFAULT ''::text NOT NULL
);


--
-- Name: Books; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Books" (
    "Id" uuid NOT NULL,
    "Title" text NOT NULL,
    "Description" text NOT NULL,
    "Published" boolean NOT NULL,
    "Version" integer DEFAULT 1 NOT NULL,
    "LiteraryTranslation" text DEFAULT ''::text NOT NULL,
    "Authors" text DEFAULT ''::text NOT NULL,
    "Difficulty" text DEFAULT ''::text NOT NULL,
    "CoverImagePath" text,
    "Archived" boolean DEFAULT false NOT NULL
);


--
-- Name: Chapters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Chapters" (
    "Id" uuid NOT NULL,
    "BookId" uuid NOT NULL,
    "Number" integer NOT NULL,
    "Title" text NOT NULL,
    "TokensJson" text NOT NULL
);


--
-- Name: ContentRevisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ContentRevisions" (
    "Id" uuid NOT NULL,
    "Kind" text NOT NULL,
    "ContentId" uuid NOT NULL,
    "Version" integer NOT NULL,
    "BaseVersion" integer NOT NULL,
    "PayloadJson" text NOT NULL,
    "Published" boolean NOT NULL,
    "EditorId" uuid NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "PublishedAt" timestamp with time zone
);


--
-- Name: DailyActivities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DailyActivities" (
    "UserId" uuid NOT NULL,
    "Day" date NOT NULL,
    "Points" integer NOT NULL
);


--
-- Name: DictionaryForms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DictionaryForms" (
    "SenseId" uuid NOT NULL,
    "SearchKey" text NOT NULL
);


--
-- Name: DictionarySenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DictionarySenses" (
    "Id" uuid NOT NULL,
    "SourceRow" integer NOT NULL,
    "SourceColumn" integer NOT NULL,
    "Ossetian" text NOT NULL,
    "Russian" text NOT NULL,
    "RussianHeadword" text NOT NULL,
    "Note" text NOT NULL,
    "Active" boolean NOT NULL
);


--
-- Name: ExerciseRewards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ExerciseRewards" (
    "UserId" uuid NOT NULL,
    "ExerciseId" uuid NOT NULL,
    "Day" date NOT NULL
);


--
-- Name: Exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Exercises" (
    "Id" uuid NOT NULL,
    "Kind" text NOT NULL,
    "RussianPrompt" text NOT NULL,
    "OssetianAnswer" text NOT NULL,
    "AlternativesJson" text NOT NULL,
    "TokensJson" text NOT NULL,
    "Explanation" text NOT NULL,
    "AudioPath" text,
    "Published" boolean NOT NULL,
    "Version" integer NOT NULL,
    "WordIdsJson" text DEFAULT ''::text NOT NULL,
    "Archived" boolean DEFAULT false NOT NULL
);


--
-- Name: ReadingPositions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ReadingPositions" (
    "UserId" uuid NOT NULL,
    "BookId" uuid NOT NULL,
    "ChapterId" uuid NOT NULL,
    "TokenIndex" integer NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL
);


--
-- Name: SavedWords; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SavedWords" (
    "UserId" uuid NOT NULL,
    "WordId" uuid NOT NULL,
    "AddedAt" timestamp with time zone NOT NULL,
    "ReviewedAt" timestamp with time zone,
    "Errors" integer NOT NULL
);


--
-- Name: Users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Users" (
    "Id" uuid NOT NULL,
    "Email" text NOT NULL,
    "PasswordHash" text NOT NULL,
    "IsEditor" boolean NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL
);


--
-- Name: Words; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Words" (
    "Id" uuid NOT NULL,
    "Ossetian" text NOT NULL,
    "Russian" text NOT NULL,
    "Example" text NOT NULL,
    "AudioPath" text,
    "Published" boolean NOT NULL,
    "Version" integer DEFAULT 1 NOT NULL,
    "DictionarySenseId" uuid,
    "DictionaryNote" text DEFAULT ''::text NOT NULL,
    "Archived" boolean DEFAULT false NOT NULL
);


--
-- Name: __EFMigrationsHistory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."__EFMigrationsHistory" (
    "MigrationId" character varying(150) NOT NULL,
    "ProductVersion" character varying(32) NOT NULL
);


--
-- Name: Achievements PK_Achievements; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Achievements"
    ADD CONSTRAINT "PK_Achievements" PRIMARY KEY ("UserId", "Code");


--
-- Name: Attempts PK_Attempts; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Attempts"
    ADD CONSTRAINT "PK_Attempts" PRIMARY KEY ("Id");


--
-- Name: Books PK_Books; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Books"
    ADD CONSTRAINT "PK_Books" PRIMARY KEY ("Id");


--
-- Name: Chapters PK_Chapters; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Chapters"
    ADD CONSTRAINT "PK_Chapters" PRIMARY KEY ("Id");


--
-- Name: ContentRevisions PK_ContentRevisions; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContentRevisions"
    ADD CONSTRAINT "PK_ContentRevisions" PRIMARY KEY ("Id");


--
-- Name: DailyActivities PK_DailyActivities; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DailyActivities"
    ADD CONSTRAINT "PK_DailyActivities" PRIMARY KEY ("UserId", "Day");


--
-- Name: DictionaryForms PK_DictionaryForms; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DictionaryForms"
    ADD CONSTRAINT "PK_DictionaryForms" PRIMARY KEY ("SenseId", "SearchKey");


--
-- Name: DictionarySenses PK_DictionarySenses; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DictionarySenses"
    ADD CONSTRAINT "PK_DictionarySenses" PRIMARY KEY ("Id");


--
-- Name: ExerciseRewards PK_ExerciseRewards; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExerciseRewards"
    ADD CONSTRAINT "PK_ExerciseRewards" PRIMARY KEY ("UserId", "ExerciseId", "Day");


--
-- Name: Exercises PK_Exercises; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Exercises"
    ADD CONSTRAINT "PK_Exercises" PRIMARY KEY ("Id");


--
-- Name: ReadingPositions PK_ReadingPositions; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReadingPositions"
    ADD CONSTRAINT "PK_ReadingPositions" PRIMARY KEY ("UserId", "BookId");


--
-- Name: SavedWords PK_SavedWords; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SavedWords"
    ADD CONSTRAINT "PK_SavedWords" PRIMARY KEY ("UserId", "WordId");


--
-- Name: Users PK_Users; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Users"
    ADD CONSTRAINT "PK_Users" PRIMARY KEY ("Id");


--
-- Name: Words PK_Words; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Words"
    ADD CONSTRAINT "PK_Words" PRIMARY KEY ("Id");


--
-- Name: __EFMigrationsHistory PK___EFMigrationsHistory; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."__EFMigrationsHistory"
    ADD CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId");


--
-- Name: IX_Attempts_UserId_ExerciseId_CompletedAt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_Attempts_UserId_ExerciseId_CompletedAt" ON public."Attempts" USING btree ("UserId", "ExerciseId", "CompletedAt");


--
-- Name: IX_Chapters_BookId_Number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_Chapters_BookId_Number" ON public."Chapters" USING btree ("BookId", "Number");


--
-- Name: IX_ContentRevisions_Kind_ContentId; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_ContentRevisions_Kind_ContentId" ON public."ContentRevisions" USING btree ("Kind", "ContentId") WHERE (NOT "Published");


--
-- Name: IX_ContentRevisions_Kind_ContentId_Version; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_ContentRevisions_Kind_ContentId_Version" ON public."ContentRevisions" USING btree ("Kind", "ContentId", "Version") WHERE "Published";


--
-- Name: IX_DictionaryForms_SearchKey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_DictionaryForms_SearchKey" ON public."DictionaryForms" USING btree ("SearchKey");


--
-- Name: IX_DictionarySenses_SourceRow_SourceColumn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_DictionarySenses_SourceRow_SourceColumn" ON public."DictionarySenses" USING btree ("SourceRow", "SourceColumn");


--
-- Name: IX_SavedWords_WordId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_SavedWords_WordId" ON public."SavedWords" USING btree ("WordId");


--
-- Name: IX_Users_Email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_Users_Email" ON public."Users" USING btree ("Email");


--
-- Name: IX_Words_DictionarySenseId; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_Words_DictionarySenseId" ON public."Words" USING btree ("DictionarySenseId");


--
-- Name: IX_Words_Ossetian; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_Words_Ossetian" ON public."Words" USING btree ("Ossetian");


--
-- Name: Chapters FK_Chapters_Books_BookId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Chapters"
    ADD CONSTRAINT "FK_Chapters_Books_BookId" FOREIGN KEY ("BookId") REFERENCES public."Books"("Id") ON DELETE CASCADE;


--
-- Name: DictionaryForms FK_DictionaryForms_DictionarySenses_SenseId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DictionaryForms"
    ADD CONSTRAINT "FK_DictionaryForms_DictionarySenses_SenseId" FOREIGN KEY ("SenseId") REFERENCES public."DictionarySenses"("Id") ON DELETE CASCADE;


--
-- Name: SavedWords FK_SavedWords_Words_WordId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SavedWords"
    ADD CONSTRAINT "FK_SavedWords_Words_WordId" FOREIGN KEY ("WordId") REFERENCES public."Words"("Id") ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict RkpYty4XtxkrTn2amwqLEDvmhz6Pq4iSwncqRHXZ522056FLfViJSP343cfV2bV

