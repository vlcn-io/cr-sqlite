/*
 * Copyright 2022 One Law LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*
 * These tests are very similar to `pk_only_tables` tests.
 * What we want to test here is that rows whose primary keys get changed get
 * replicated correctly.
 *
 * Example:
 * ```
 * CREATE TABLE foo (id primary key, value);
 * ```
 *
 * | id | value |
 * | -- | ----- |
 * | 1  |  abc  |
 *
 * Now we:
 * ```
 * UPDATE foo SET id = 2 WHERE id = 1;
 * ```
 *
 * This should be a _delete_ of row id 1 and a _create_ of
 * row id 2, bringing all the values from row 1 to row 2.
 *
 * pk_only_tables.rs tested this for table that _only_
 * had primary key columns but not for tables that have
 * primary key columns + other columns.
 */
