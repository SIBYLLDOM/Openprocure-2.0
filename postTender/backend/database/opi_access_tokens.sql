CREATE TABLE IF NOT EXISTS `opi_access_tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `contract_no` varchar(255) NOT NULL,
  `opi_file_path` varchar(255) NOT NULL,
  `token` varchar(191) NOT NULL,
  `status` enum('Active','Closed') DEFAULT 'Active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_token` (`token`)
)

INSERT INTO `opi_access_tokens` (`id`, `contract_no`, `opi_file_path`, `token`, `status`, `created_at`) VALUES
(1, 'TEST-TOKEN-123', 'test_opi_token.json', '48b51354-d522-4306-98ae-5fe5f303a400', 'Active', '2026-02-08 17:09:14'),
(2, 'GEMC-511687791861786', 'opi_output/OPI_GEMC-511687791861786.json', '69d67cab-f9eb-4f71-b4b4-b2aa10b371c3', 'Active', '2026-02-08 17:11:54'),
(3, 'GEMC-511687791861786', 'opi_output/OPI_GEMC-511687791861786.json', 'cbe66ee3-a290-4e7f-81cd-e97708e5e205', 'Active', '2026-02-08 17:18:34'),
(4, 'GEMC-511687754914858', 'opi_output/OPI_GEMC-511687754914858.json', '8029ffa2-e83a-40f0-9c54-b6259d64441b', 'Active', '2026-02-08 17:21:12'),
(5, 'GEMC-511687754914858', 'opi_output/OPI_GEMC-511687754914858.json', '18aa4e1a-a027-483d-87f4-2fc5066459d9', 'Active', '2026-02-08 17:26:29'),
(6, 'GEMC-511687754914858', 'opi_output/OPI_GEMC-511687754914858.json', '24b5de3d-981a-42cd-90e0-10260e1dd2bc', 'Active', '2026-02-08 17:28:38');