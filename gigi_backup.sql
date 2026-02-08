--
-- PostgreSQL database cluster dump
--

\restrict OuXVBca2JVjelXIczNw5dd9f6c53NQgZgUmby2XYI9KHVCq49s3rojR2uHbzKkC

SET default_transaction_read_only = off;

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

--
-- Drop databases (except postgres and template1)
--

DROP DATABASE gigi_db;




--
-- Drop roles
--

DROP ROLE postgres;


--
-- Roles
--

CREATE ROLE postgres;
ALTER ROLE postgres WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS PASSWORD 'SCRAM-SHA-256$4096:mtw/6d2qzWGus3D13NFZkw==$nARVWUzBbWWNkiITnr6VvjADf2EcjeeYgBUGAkbe6E4=:hf33n41vWGq8B/8q8XebpJ47mLL1SzDeT++KPhN3r2s=';

--
-- User Configurations
--








\unrestrict OuXVBca2JVjelXIczNw5dd9f6c53NQgZgUmby2XYI9KHVCq49s3rojR2uHbzKkC

--
-- Databases
--

--
-- Database "template1" dump
--

--
-- PostgreSQL database dump
--

\restrict 1zxggSqtsyqAfeSrq1TO4Ttix5YCO9WKXezlh9VTzdijdunJpapebEPWDpfVasK

-- Dumped from database version 16.11 (Debian 16.11-1.pgdg13+1)
-- Dumped by pg_dump version 16.11 (Debian 16.11-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

UPDATE pg_catalog.pg_database SET datistemplate = false WHERE datname = 'template1';
DROP DATABASE template1;
--
-- Name: template1; Type: DATABASE; Schema: -; Owner: postgres
--

CREATE DATABASE template1 WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'en_US.utf8';


ALTER DATABASE template1 OWNER TO postgres;

\unrestrict 1zxggSqtsyqAfeSrq1TO4Ttix5YCO9WKXezlh9VTzdijdunJpapebEPWDpfVasK
\connect template1
\restrict 1zxggSqtsyqAfeSrq1TO4Ttix5YCO9WKXezlh9VTzdijdunJpapebEPWDpfVasK

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: DATABASE template1; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON DATABASE template1 IS 'default template for new databases';


--
-- Name: template1; Type: DATABASE PROPERTIES; Schema: -; Owner: postgres
--

ALTER DATABASE template1 IS_TEMPLATE = true;


\unrestrict 1zxggSqtsyqAfeSrq1TO4Ttix5YCO9WKXezlh9VTzdijdunJpapebEPWDpfVasK
\connect template1
\restrict 1zxggSqtsyqAfeSrq1TO4Ttix5YCO9WKXezlh9VTzdijdunJpapebEPWDpfVasK

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: DATABASE template1; Type: ACL; Schema: -; Owner: postgres
--

REVOKE CONNECT,TEMPORARY ON DATABASE template1 FROM PUBLIC;
GRANT CONNECT ON DATABASE template1 TO PUBLIC;


--
-- PostgreSQL database dump complete
--

\unrestrict 1zxggSqtsyqAfeSrq1TO4Ttix5YCO9WKXezlh9VTzdijdunJpapebEPWDpfVasK

--
-- Database "gigi_db" dump
--

--
-- PostgreSQL database dump
--

\restrict eCpPBDEWdXQdYxhcwrlGysP2PY2uNShUx68vxgVYfA7FHZP7MYCYItHtffNfibU

-- Dumped from database version 16.11 (Debian 16.11-1.pgdg13+1)
-- Dumped by pg_dump version 16.11 (Debian 16.11-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: gigi_db; Type: DATABASE; Schema: -; Owner: postgres
--

CREATE DATABASE gigi_db WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'en_US.utf8';


ALTER DATABASE gigi_db OWNER TO postgres;

\unrestrict eCpPBDEWdXQdYxhcwrlGysP2PY2uNShUx68vxgVYfA7FHZP7MYCYItHtffNfibU
\connect gigi_db
\restrict eCpPBDEWdXQdYxhcwrlGysP2PY2uNShUx68vxgVYfA7FHZP7MYCYItHtffNfibU

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: TaskStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."TaskStatus" AS ENUM (
    'Pending',
    'Done',
    'Cancelled',
    'InProgress'
);


ALTER TYPE public."TaskStatus" OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Reminder; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Reminder" (
    id text NOT NULL,
    "reminderId" integer NOT NULL,
    "chatId" text NOT NULL,
    "senderId" text,
    title text NOT NULL,
    mentions text[],
    "remindAtUtc" timestamp(3) without time zone NOT NULL,
    timezone text DEFAULT 'Asia/Kuwait'::text NOT NULL,
    "reminder24hSent" boolean DEFAULT false NOT NULL,
    "reminder1hSent" boolean DEFAULT false NOT NULL,
    "reminderSent" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "reminder30mSent" boolean DEFAULT false NOT NULL
);


ALTER TABLE public."Reminder" OWNER TO postgres;

--
-- Name: Reminder_reminderId_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."Reminder_reminderId_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Reminder_reminderId_seq" OWNER TO postgres;

--
-- Name: Reminder_reminderId_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."Reminder_reminderId_seq" OWNED BY public."Reminder"."reminderId";


--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO postgres;

--
-- Name: tasks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tasks (
    id text NOT NULL,
    "taskId" integer NOT NULL,
    "chatId" text NOT NULL,
    "senderId" text,
    title text NOT NULL,
    "assignedTo" text[],
    status public."TaskStatus" DEFAULT 'Pending'::public."TaskStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.tasks OWNER TO postgres;

--
-- Name: tasks_taskId_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."tasks_taskId_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."tasks_taskId_seq" OWNER TO postgres;

--
-- Name: tasks_taskId_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."tasks_taskId_seq" OWNED BY public.tasks."taskId";


--
-- Name: Reminder reminderId; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Reminder" ALTER COLUMN "reminderId" SET DEFAULT nextval('public."Reminder_reminderId_seq"'::regclass);


--
-- Name: tasks taskId; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks ALTER COLUMN "taskId" SET DEFAULT nextval('public."tasks_taskId_seq"'::regclass);


--
-- Data for Name: Reminder; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Reminder" (id, "reminderId", "chatId", "senderId", title, mentions, "remindAtUtc", timezone, "reminder24hSent", "reminder1hSent", "reminderSent", "createdAt", "updatedAt", "reminder30mSent") FROM stdin;
ebee2473-b8d9-41c3-828f-dfa061a8a73a	24	100897539518569@lid	100897539518569@lid	Time to eat	{}	2025-12-13 11:43:10.376	Asia/Kuwait	t	t	t	2025-12-13 11:41:10.381	2025-12-13 11:43:10.396	f
1c170931-ecd7-4b9c-a38c-871e7fc3f08e	20	120363421658721876@g.us	100897539518569@lid	Meeting with Jaber	{4823936200816@lid}	2025-12-10 20:14:51.829	Asia/Kuwait	t	t	t	2025-12-10 20:12:51.885	2025-12-10 20:14:52.111	f
c285ba74-a320-44cd-bedc-499be27ff8d8	2	120363421658721876@g.us	system	Buy oranges	{}	2025-12-09 19:47:18.072	Asia/Kuwait	t	t	t	2025-12-06 19:47:18.115	2025-12-09 19:47:18.435	f
f0ed8167-252f-403c-9433-01bc7b81db57	14	96555712202-1596809719@g.us	system	Kick your own butt	{}	2025-12-10 04:10:25.426	Asia/Kuwait	t	t	t	2025-12-10 02:10:25.472	2025-12-10 04:10:25.761	f
0e176e68-df58-416c-baae-6708e966e2c1	30	120363314827633357@g.us	5235598749725@lid	gaming developers (anwar & ahmad)	{}	2025-12-20 16:30:00	Asia/Kuwait	t	t	t	2025-12-20 10:54:42.362	2025-12-20 16:30:00.538	t
86aae300-56da-479c-ac4e-ae58b31ab7e7	10	120363422403011880@g.us	system	Brush teeth	{}	2025-12-06 20:27:38.67	Asia/Kuwait	t	t	t	2025-12-06 20:22:38.674	2025-12-06 20:27:39.507	f
e8fb77ae-4823-49fd-9ec5-8c18c28d99e6	5	120363421658721876@g.us	system	Remind me to test you	{}	2025-12-06 21:00:00	Asia/Kuwait	t	t	t	2025-12-06 20:01:28.21	2025-12-06 21:00:00.692	f
6f9ec202-2eae-45e8-9516-f0673f99920f	11	120363422403011880@g.us	system	good morning boss	{}	2025-12-07 04:55:00	Asia/Kuwait	t	t	t	2025-12-06 20:28:07.645	2025-12-07 04:55:00.871	f
87c23a0f-dc70-4b34-ab3c-441f466a3c3f	21	120363421658721876@g.us	100897539518569@lid	meeting with jaber	{4823936200816@lid}	2025-12-10 20:19:04.038	Asia/Kuwait	t	t	t	2025-12-10 20:17:04.113	2025-12-10 20:19:04.254	f
4ada4d36-2f0a-405b-a0a1-8a6b571cfe5d	4	120363421658721876@g.us	system	Remind me to test you	{}	2025-12-07 09:00:00	Asia/Kuwait	t	t	t	2025-12-06 19:57:41.658	2025-12-07 09:00:01.159	f
82154339-569a-4669-9722-046278faee63	15	120363421658721876@g.us	100897539518569@lid	test gigi with mohamed	{4823936200816@lid}	2025-12-10 18:40:44.368	Asia/Kuwait	t	t	t	2025-12-10 18:38:44.409	2025-12-10 19:27:41.47	f
71812d7c-bbe4-4e9d-8b1e-1bdf78c0071c	6	120363421658721876@g.us	system	Remind me to make my homework	{}	2025-12-07 13:00:00	Asia/Kuwait	t	t	t	2025-12-06 20:06:03.181	2025-12-07 13:00:01.147	f
d8ef458b-c14e-45a5-9c3d-0d7d494836ce	16	120363421658721876@g.us	100897539518569@lid	test gigi with mohamed	{4823936200816@lid}	2025-12-10 18:40:54.47	Asia/Kuwait	t	t	t	2025-12-10 18:38:54.512	2025-12-10 19:27:41.671	f
1fdbfc71-a777-480e-9759-526ac24484c2	7	120363421658721876@g.us	system	Warzone discussion with Roman via meeting in tgh	{Roman}	2025-12-07 14:00:00	Asia/Kuwait	t	t	t	2025-12-06 20:15:30.277	2025-12-07 14:00:00.918	f
4392cd23-f0a8-45d5-8698-becc2be61983	8	120363422403011880@g.us	system	warzone discussion with roman at tgh	{Roman}	2025-12-07 14:00:00	Asia/Kuwait	t	t	t	2025-12-06 20:16:16.107	2025-12-07 14:00:01.698	f
91d4ab05-7792-4b09-8281-bf287cafb13d	12	120363405311600799@g.us	system	Call Yasser	{Yasser}	2025-12-07 14:37:42.145	Asia/Kuwait	t	t	t	2025-12-07 14:35:42.15	2025-12-07 14:37:42.404	f
63cf3799-7fa2-4117-bf0c-cafaa4bc4232	25	120363422403011880@g.us	100897539518569@lid	meet with jaber	{5235598749725@lid}	2025-12-13 21:00:29.111	Asia/Kuwait	t	t	t	2025-12-13 20:58:29.161	2025-12-13 21:00:29.277	f
4c29f508-8edb-4e67-9f9f-d12a729893dd	13	120363422403011880@g.us	system	Call KDD	{}	2025-12-07 16:20:00	Asia/Kuwait	t	t	t	2025-12-07 15:19:17.229	2025-12-07 16:20:00.865	f
0af9203f-5a58-4d1c-b268-19cdf09b3e0f	17	120363421658721876@g.us	100897539518569@lid	meeting with ahmed	{jaber,96569072509@s.whatsapp.net}	2025-12-10 19:38:06.298	Asia/Kuwait	t	t	t	2025-12-10 19:36:06.332	2025-12-10 19:38:06.481	f
1881664d-87ce-4c74-9f17-cc8470f937fb	22	120363421658721876@g.us	100897539518569@lid	Meeting with Jaber	{4823936200816@lid}	2025-12-10 20:43:10.668	Asia/Kuwait	t	t	t	2025-12-10 20:41:10.727	2025-12-10 20:43:10.934	f
69eaa17d-7194-4eb0-b2e7-93809dcdb275	18	120363422403011880@g.us	100897539518569@lid	Meeting with Jaber	{brahaber,34346987692098@lid}	2025-12-10 19:52:22.072	Asia/Kuwait	t	t	t	2025-12-10 19:49:22.113	2025-12-10 19:52:22.22	f
6e711b8b-a5d6-40e7-8734-937909cdf504	19	120363421658721876@g.us	100897539518569@lid	meeting with jaber	{4823936200816@lid}	2025-12-10 20:05:00.643	Asia/Kuwait	t	t	t	2025-12-10 20:03:00.694	2025-12-10 20:05:00.895	f
e6abda1a-576e-4e78-92d6-b9abfd6622b0	23	120363422403011880@g.us	100897539518569@lid	Meeting with Jaber	{34346987692098@lid}	2025-12-10 20:53:28.112	Asia/Kuwait	t	t	t	2025-12-10 20:51:28.174	2025-12-10 20:53:28.299	f
aa243150-ebc0-4dee-bb1d-480289ff083e	1	120363421658721876@g.us	system	Buy groceries	{}	2025-12-11 07:00:00	Asia/Kuwait	t	t	t	2025-12-06 19:43:47.433	2025-12-11 07:00:00.718	f
ef2632a5-c23a-4caf-8e46-64ca9ed4895a	26	120363422403011880@g.us	100897539518569@lid	meeting with bo khaled	{34346987692098@lid,5235598749725@lid}	2025-12-13 21:05:56.899	Asia/Kuwait	t	t	t	2025-12-13 21:03:56.938	2025-12-13 21:05:57.056	f
1e73008b-649e-4bbd-979f-a3ee2068aa96	3	120363421658721876@g.us	system	Deploy my server	{}	2025-12-11 08:00:00	Asia/Kuwait	t	t	t	2025-12-06 19:48:16.276	2025-12-11 08:00:00.63	f
e7f7d0b6-68da-468a-ad48-b97f8376f58c	28	120363314827633357@g.us	5235598749725@lid	Meeting with Mr. Ibrahim (Dunkin' Donuts)	{277218697678957@lid,123571057725449@lid,106421219766479@lid,168006235779186@lid,53128896499943@lid,83335418216655@lid,5235598749725@lid}	2025-12-17 13:19:10.202	Asia/Kuwait	t	t	t	2025-12-17 12:34:10.252	2025-12-17 13:19:10.752	t
3a1ede34-f0c0-4adf-b773-77ff0c49979e	27	120363314827633357@g.us	34346987692098@lid	Call Hesham from Tamdeen	{}	2025-12-15 08:00:00	Asia/Kuwait	t	t	t	2025-12-14 21:46:57.084	2025-12-15 08:00:01.089	t
cde284ed-b3af-4294-9412-fc2479756800	29	120363314827633357@g.us	276681843585178@lid	meeting with abu yahya(3rood store)	{}	2025-12-20 09:00:00	Asia/Kuwait	t	t	t	2025-12-19 12:57:46.526	2025-12-20 09:00:00.481	t
3bd92f51-4728-4802-a814-787137aded40	31	120363422403011880@g.us	100897539518569@lid	sleep	{34346987692098@lid,5235598749725@lid}	2025-12-28 19:36:07.462	Asia/Kuwait	t	t	t	2025-12-28 19:34:07.495	2025-12-28 19:36:07.62	t
7dbc20b0-4fb6-4f2c-aada-03942dc7fba1	32	120363421658721876@g.us	100897539518569@lid	Meeting with Jaber	{}	2025-12-29 20:16:31.237	Asia/Kuwait	t	t	t	2025-12-29 19:56:31.281	2025-12-29 20:16:31.669	t
a0ff910c-6b63-41cc-8beb-9dc20f69d744	33	120363314827633357@g.us	5235598749725@lid	Meeting with hexar consultancy at the gaming hub	{}	2025-12-31 10:00:00	Asia/Kuwait	t	t	t	2025-12-30 11:22:50.194	2025-12-31 10:00:00.437	t
651bc10f-90d0-4626-9b61-f0a377a78874	35	120363421658721876@g.us	100897539518569@lid	Buy carbamid to your grandma	{}	2026-01-04 06:00:00	Asia/Kuwait	t	t	t	2026-01-03 21:47:33.841	2026-01-04 06:00:00.412	t
dcf8d985-b05e-4f06-b646-7eaf5aae94cd	38	120363314827633357@g.us	276681843585178@lid	Meetings with Azgardian Comics	{}	2026-01-06 09:00:00	Asia/Kuwait	t	t	t	2026-01-05 20:34:29.177	2026-01-06 09:00:00.501	t
7aa628f5-91f1-466e-8bb9-279fe1b88481	36	120363314827633357@g.us	34346987692098@lid	Meeting with Huda from Tec in their office	{}	2026-01-08 11:00:00	Asia/Kuwait	t	t	t	2026-01-05 08:35:38.174	2026-01-08 11:00:02.293	t
a7b5b96a-d85e-4142-9d16-22d7471c1faf	37	120363421658721876@g.us	100897539518569@lid	Meeting with Huda from tec in their office	{}	2026-01-08 11:00:00	Asia/Kuwait	t	t	t	2026-01-05 08:55:16.624	2026-01-08 11:00:01.12	t
dd794609-66bd-42dd-bede-a71057ff6eda	52	120363314827633357@g.us	276681843585178@lid	Workshop session: Health & Safety Course with Dr. Yosuf. Attendance is mandatory.	{}	2026-01-31 09:00:00	Asia/Kuwait	t	t	t	2026-01-30 17:13:52.268	2026-01-31 09:00:01.033	t
d84832fb-bdf0-41a5-8d01-367667e7d2ab	40	120363314827633357@g.us	4823936200816@lid	meeting with dawood al alkindari	{5235598749725@lid}	2026-01-06 14:00:00	Asia/Kuwait	t	t	t	2026-01-06 11:20:09.861	2026-01-06 14:00:00.794	t
e86f32c1-433a-4d09-b1a4-37566a22d4f8	47	120363314827633357@g.us	34346987692098@lid	Meeting with FIFA champion Ali	{}	2026-01-20 15:00:00	Asia/Kuwait	t	t	t	2026-01-19 18:18:53.62	2026-01-20 15:00:01.622	t
1aacb27d-6813-49ef-8660-abd7fc18f4d3	41	120363314827633357@g.us	4823936200816@lid	meeting with media agency	{}	2026-01-06 15:00:00	Asia/Kuwait	t	t	t	2026-01-06 13:19:35.069	2026-01-06 15:00:00.544	t
cea78d38-6032-43e7-9a78-f26b990083a7	43	120363314827633357@g.us	34346987692098@lid	meeting with dawood kindari	{}	2026-01-07 11:00:00	Asia/Kuwait	t	t	t	2026-01-06 23:34:29.284	2026-01-07 11:00:03.095	t
88cc015a-945f-4484-925c-0285d6918a5e	42	120363314827633357@g.us	34346987692098@lid	Meeting with Jameel North Nuqra	{}	2026-01-07 12:00:00	Asia/Kuwait	t	t	t	2026-01-06 19:26:24.855	2026-01-07 12:00:01.656	t
9700a377-e127-40de-a3ea-1494226ecf6f	53	120363314827633357@g.us	34346987692098@lid	Meeting with Omar Bo Yousef from Methods Coffee Academy	{}	2026-01-31 14:00:00	Asia/Kuwait	t	t	t	2026-01-31 12:50:22.406	2026-01-31 14:00:00.95	t
e029d3ce-9d6e-4169-a24d-ba899776443f	50	120363314827633357@g.us	34346987692098@lid	Meeting with Bo Yousef for First Aid & Medic Safety Course	{}	2026-01-26 11:30:00	Asia/Kuwait	t	t	t	2026-01-26 11:07:08.822	2026-01-26 11:30:02.048	t
77235b6e-53f0-4e85-aa66-94db821a47da	48	120363314827633357@g.us	34346987692098@lid	Meeting with Hamada Jamal from Coca Cola for site seeing	{83335418216655@lid}	2026-01-26 12:30:00	Asia/Kuwait	t	t	t	2026-01-26 09:08:56.62	2026-01-26 12:30:01.706	t
ba08b9e3-44d7-43ea-a5b6-48a824038cfa	44	120363314827633357@g.us	277218697678957@lid	meeting with game store in alandalus mall	{}	2026-01-14 09:00:00	Asia/Kuwait	t	t	t	2026-01-11 20:44:11.35	2026-01-14 09:00:00.563	t
eeeecb03-63a0-4174-8f1c-52cdc9bf0d4f	45	120363314827633357@g.us	5235598749725@lid	meeting with costa coffee at the gaming hub	{}	2026-01-14 09:13:25.032	Asia/Kuwait	t	t	t	2026-01-14 09:03:25.042	2026-01-14 09:13:25.501	t
0cab7dee-9bae-485c-89de-d137881c89bf	49	120363314827633357@g.us	34346987692098@lid	Meeting with Sarah from Diet Care	{}	2026-01-26 14:00:00	Asia/Kuwait	t	t	t	2026-01-26 09:19:39.374	2026-01-26 14:00:01.729	t
032ed6f1-9f75-4501-824e-c905171d9dca	46	120363314827633357@g.us	34346987692098@lid	meeting with Sunil from Partner Plus	{}	2026-01-19 13:00:00	Asia/Kuwait	t	t	t	2026-01-19 10:33:51.361	2026-01-19 13:00:00.898	t
81403240-e440-4ded-ba9b-58213a8c7547	51	120363314827633357@g.us	34346987692098@lid	Meeting with Bo Rakan from House of Lightening	{}	2026-01-28 12:03:00	Asia/Kuwait	t	t	t	2026-01-27 16:48:43.612	2026-01-28 12:03:01.436	t
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
c91a15a6-0e21-4906-a69c-1692683d7933	683d20c8007e09dcf3593c72000882a29ad5da0119ef1fef03ca6cb8f4fd1d52	2025-12-06 19:40:10.079402+00	20251206194010_init	\N	\N	2025-12-06 19:40:10.038306+00	1
f5777bbc-5f32-4688-b369-29e2b20abd64	3c67b9fb1402730c3c77bb12d3c66edb126d011f7f6bc469801b9ee5c21b89f1	2025-12-07 17:33:16.426826+00	20251207173316_add_inprogress_status	\N	\N	2025-12-07 17:33:16.421091+00	1
60a5dfcb-4bf0-440b-8505-5afec4bea6a6	3c1ae1ebde4ae523df8d93d09092adcbce851d878dde470f0e93b7b8e392e765	2025-12-13 19:20:39.052704+00	20251213192039_add_reminder_30m_sent	\N	\N	2025-12-13 19:20:39.044945+00	1
\.


--
-- Data for Name: tasks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tasks (id, "taskId", "chatId", "senderId", title, "assignedTo", status, "createdAt", "updatedAt") FROM stdin;
dd6cb8a7-fb7b-4591-bdc4-11257ef4ace4	103	120363314827633357@g.us	34346987692098@lid	to plan academy to be in b2 and get frances to plan it	{34346987692098@lid}	Done	2026-01-22 11:01:36.074	2026-01-28 06:43:41.875
cac87be2-deb7-4b28-8c4e-4c7eda8ed5bb	87	120363314827633357@g.us	34346987692098@lid	stop the fire sprinkler and use the fire extinguisher.	{34346987692098@lid}	Pending	2026-01-22 11:01:36.011	2026-02-05 08:08:21.297
9589abd2-ac90-4249-a7fb-fef64197beda	88	120363314827633357@g.us	34346987692098@lid	we have to choose war zone people who will be part of the team, and we also have to conduct the tryouts.	{34346987692098@lid}	Pending	2026-01-22 11:01:36.016	2026-02-05 08:08:21.304
232170c4-d17b-4c98-bf68-e00fa74d464f	89	120363314827633357@g.us	34346987692098@lid	we need to contact the nursery and email them.	{34346987692098@lid}	Done	2026-01-22 11:01:36.02	2026-02-05 08:08:21.309
4a78a65d-82e0-44e8-8d5a-5d5174905992	95	120363314827633357@g.us	34346987692098@lid	buy an all-in-one pc for the pc museum.	{34346987692098@lid}	Pending	2026-01-22 11:01:36.043	2026-02-05 08:08:21.332
b9111830-67e5-43eb-ac8b-97c9d7a3da36	96	120363314827633357@g.us	34346987692098@lid	figure out the solution for gloves and talk to the laundry.	{34346987692098@lid}	Pending	2026-01-22 11:01:36.047	2026-02-05 08:08:21.337
e116ad96-b93e-4e10-b9f1-8f38ff7198b2	97	120363314827633357@g.us	34346987692098@lid	also check the reception area.	{34346987692098@lid}	Done	2026-01-22 11:01:36.051	2026-02-05 08:08:21.341
bcd752af-e491-4362-b4ec-53be56fe7bfc	98	120363314827633357@g.us	34346987692098@lid	check the controlling gate.	{34346987692098@lid}	Done	2026-01-22 11:01:36.054	2026-02-05 08:08:21.346
29a01be2-46db-4c24-856e-de8d04f5a5f7	99	120363314827633357@g.us	34346987692098@lid	check the parking gate.	{34346987692098@lid}	Done	2026-01-22 11:01:36.058	2026-02-05 08:08:21.351
37b3bb21-0174-4164-88f8-9ed232ab8793	100	120363314827633357@g.us	34346987692098@lid	check the console area fiber optic and electrical points.	{34346987692098@lid}	Pending	2026-01-22 11:01:36.063	2026-02-05 08:08:21.355
1c1836c2-68ef-4870-8564-69866e8b04fa	101	120363314827633357@g.us	34346987692098@lid	to create a glass on the esport wall	{34346987692098@lid}	Pending	2026-01-22 11:01:36.067	2026-02-05 08:08:21.359
c0d6d8f1-1cd7-465e-be10-5cbd8ffc214c	102	120363314827633357@g.us	34346987692098@lid	to check for led styles thy run on battery for the pc arena area	{34346987692098@lid}	Pending	2026-01-22 11:01:36.07	2026-02-05 08:08:21.363
d343dc84-d86a-4678-b605-532afe65e718	94	120363314827633357@g.us	34346987692098@lid	check every single electrical capacity.	{34346987692098@lid}	Done	2026-01-22 11:01:36.039	2026-01-28 06:43:41.824
810d9114-ba05-47bf-8756-def539e1c8e1	90	120363314827633357@g.us	34346987692098@lid	make sure to buy 3 more arcade machines from geekay.	{34346987692098@lid}	Pending	2026-01-22 11:01:36.023	2026-02-05 08:08:21.314
ee63ecce-86ec-42a3-98fe-5d91b0f609d9	91	120363314827633357@g.us	34346987692098@lid	make sure to introduce retro zone play area tickets in the gaming hub app.	{34346987692098@lid}	Pending	2026-01-22 11:01:36.027	2026-02-05 08:08:21.318
1b1fc235-8dc5-4b2f-a047-477bd740f427	92	120363314827633357@g.us	34346987692098@lid	make sure the retro zone console area has console boxes.	{34346987692098@lid}	Done	2026-01-22 11:01:36.031	2026-02-05 08:08:21.323
930b4bed-4eb9-4632-a6d7-667d720ddf52	93	120363314827633357@g.us	34346987692098@lid	on the first floor, consider the entire left side for tcg, which will include 6 offices, and talk to sulaiman sultan about the expansion of the left side.	{34346987692098@lid}	Done	2026-01-22 11:01:36.034	2026-02-05 08:08:21.328
0eb8f465-7f78-4a17-a2b3-8f9d91d45e74	70	120363314827633357@g.us	\N	validate the museum wall translations	{4823936200816@lid}	InProgress	2025-12-30 12:34:53.519	2025-12-30 15:04:06.252
cdf006b0-4797-4a2e-98f2-19e93205862a	71	120363314827633357@g.us	\N	daily ai bites	{4823936200816@lid}	Pending	2025-12-30 22:54:18.353	2025-12-30 22:54:18.353
6b33c8f3-b4c1-4d29-bcc6-609befcb675d	81	120363314827633357@g.us	4823936200816@lid	creating a shared ppt for tasks weekly follow ups, with each g as a slide.	{34346987692098@lid}	Done	2026-01-03 11:54:49.056	2026-01-18 22:17:47.959
74e8850c-6f73-4fff-8687-ac2177534eb4	85	120363314827633357@g.us	\N	update gigi to accept status on creation	{4823936200816@lid}	Pending	2026-01-03 11:56:17.427	2026-01-03 11:56:17.427
2dce5c5c-cbf4-43b4-b579-6097ee727eca	72	120363314827633357@g.us	4823936200816@lid	finish coorperate presentation	{34346987692098@lid}	Done	2026-01-03 11:54:49.012	2026-01-03 12:00:11.772
11163b4a-9ab2-4fe6-b749-ebbdba600bd5	73	120363314827633357@g.us	4823936200816@lid	finish warzone presentation	{34346987692098@lid}	Done	2026-01-03 11:54:49.026	2026-01-03 12:00:11.779
f53dcc7b-cc97-4f98-acd9-7a7d97c97cda	74	120363314827633357@g.us	4823936200816@lid	finish player benefit presentation	{34346987692098@lid}	Done	2026-01-03 11:54:49.029	2026-01-03 12:00:11.785
e3bedc24-53a8-4e2d-b15e-7ac7e24b5b3a	75	120363314827633357@g.us	4823936200816@lid	contact geekay and ask about having there esport team part of battle of the clans	{34346987692098@lid}	Done	2026-01-03 11:54:49.033	2026-01-03 12:00:11.79
d75578af-dfa9-43a2-844a-8ac3172ac497	76	120363314827633357@g.us	4823936200816@lid	check with geekay to make sure we can sell our esport clans merchandise	{34346987692098@lid}	Done	2026-01-03 11:54:49.038	2026-01-03 12:00:11.796
07f2f6e6-4b2f-4ac4-8bb8-d11b5455e22c	77	120363314827633357@g.us	4823936200816@lid	finish any console museum related designs	{34346987692098@lid}	Done	2026-01-03 11:54:49.042	2026-01-03 12:00:11.802
0a1759ae-b6c5-4d3d-94e6-acc968cc9657	78	120363314827633357@g.us	4823936200816@lid	follow up with zain internet.	{34346987692098@lid}	Done	2026-01-03 11:54:49.045	2026-01-03 12:00:11.807
49dd8303-9d75-4ec6-9da0-5d9427177bdf	79	120363314827633357@g.us	4823936200816@lid	ask guinness danny hickson will there be a price difference to be paid if we decide on a 3 year membership	{34346987692098@lid}	Done	2026-01-03 11:54:49.049	2026-01-03 12:00:11.813
a76964e5-9ceb-4112-9c7e-b0bec000873b	80	120363314827633357@g.us	4823936200816@lid	adding beneficiaries in the system	{34346987692098@lid}	Done	2026-01-03 11:54:49.052	2026-01-03 12:00:11.818
10adc3df-bb95-4b54-95db-5b29fac7c437	82	120363314827633357@g.us	4823936200816@lid	finalize the business bank account	{34346987692098@lid}	Done	2026-01-03 11:54:49.059	2026-01-03 12:00:11.823
28844dc2-889a-4c08-8dc1-9eafae5b9167	83	120363314827633357@g.us	4823936200816@lid	tba sponsorship prices to be finalised	{34346987692098@lid}	Done	2026-01-03 11:54:49.063	2026-01-03 12:00:11.829
0c6f56e0-b54d-4eb9-8f03-16d59bd06312	84	120363314827633357@g.us	4823936200816@lid	media room creating	{34346987692098@lid}	Done	2026-01-03 11:54:49.066	2026-01-03 12:00:11.843
82651ee8-e865-4372-9280-1d8ca25efe9d	86	120363314827633357@g.us	\N	fix gigi's time awareness	{4823936200816@lid}	Pending	2026-01-06 11:21:28.207	2026-01-06 11:21:28.207
\.


--
-- Name: Reminder_reminderId_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."Reminder_reminderId_seq"', 53, true);


--
-- Name: tasks_taskId_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."tasks_taskId_seq"', 103, true);


--
-- Name: Reminder Reminder_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Reminder"
    ADD CONSTRAINT "Reminder_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: Reminder_chatId_remindAtUtc_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Reminder_chatId_remindAtUtc_idx" ON public."Reminder" USING btree ("chatId", "remindAtUtc");


--
-- Name: Reminder_remindAtUtc_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Reminder_remindAtUtc_idx" ON public."Reminder" USING btree ("remindAtUtc");


--
-- Name: tasks_chatId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "tasks_chatId_idx" ON public.tasks USING btree ("chatId");


--
-- Name: tasks_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX tasks_status_idx ON public.tasks USING btree (status);


--
-- PostgreSQL database dump complete
--

\unrestrict eCpPBDEWdXQdYxhcwrlGysP2PY2uNShUx68vxgVYfA7FHZP7MYCYItHtffNfibU

--
-- Database "postgres" dump
--

--
-- PostgreSQL database dump
--

\restrict zU4zRxw7f0BqBe79fBpVkSJLKLb9k3YWKdBGoRgQXlBOK2wqO5rqV6ofbLmumBM

-- Dumped from database version 16.11 (Debian 16.11-1.pgdg13+1)
-- Dumped by pg_dump version 16.11 (Debian 16.11-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

DROP DATABASE postgres;
--
-- Name: postgres; Type: DATABASE; Schema: -; Owner: postgres
--

CREATE DATABASE postgres WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'en_US.utf8';


ALTER DATABASE postgres OWNER TO postgres;

\unrestrict zU4zRxw7f0BqBe79fBpVkSJLKLb9k3YWKdBGoRgQXlBOK2wqO5rqV6ofbLmumBM
\connect postgres
\restrict zU4zRxw7f0BqBe79fBpVkSJLKLb9k3YWKdBGoRgQXlBOK2wqO5rqV6ofbLmumBM

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: DATABASE postgres; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON DATABASE postgres IS 'default administrative connection database';


--
-- PostgreSQL database dump complete
--

\unrestrict zU4zRxw7f0BqBe79fBpVkSJLKLb9k3YWKdBGoRgQXlBOK2wqO5rqV6ofbLmumBM

--
-- PostgreSQL database cluster dump complete
--

