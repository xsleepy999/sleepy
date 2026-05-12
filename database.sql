-- ============================================
-- Script untuk membuat database dan tabel prodi
-- Jalankan di phpMyAdmin XAMPP
-- ============================================

-- Membuat database (jika belum ada)
CREATE DATABASE IF NOT EXISTS db_kampus
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

USE db_kampus;

-- ============================================
-- Tabel 1: prodi (Program Studi)
-- ============================================
CREATE TABLE IF NOT EXISTS prodi (
    kode_prodi VARCHAR(10) NOT NULL PRIMARY KEY,
    nama_prodi VARCHAR(100) NOT NULL,
    akreditasi ENUM('A', 'B', 'C', 'Unggul', 'Baik Sekali', 'Baik', 'Belum Terakreditasi') NOT NULL DEFAULT 'Belum Terakreditasi'
) ENGINE=InnoDB;

-- ============================================
-- Tabel 2: dosen (Dosen)
-- ============================================
CREATE TABLE IF NOT EXISTS dosen (
    nidn VARCHAR(20) NOT NULL PRIMARY KEY,
    nama_dosen VARCHAR(100) NOT NULL,
    kode_prodi VARCHAR(10) NOT NULL,
    FOREIGN KEY (kode_prodi) REFERENCES prodi(kode_prodi)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ============================================
-- Tabel 3: mahasiswa (Mahasiswa)
-- ============================================
CREATE TABLE IF NOT EXISTS mahasiswa (
    nim VARCHAR(20) NOT NULL PRIMARY KEY,
    nama_mahasiswa VARCHAR(100) NOT NULL,
    kode_prodi VARCHAR(10) NOT NULL,
    angkatan YEAR NOT NULL,
    FOREIGN KEY (kode_prodi) REFERENCES prodi(kode_prodi)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ============================================
-- Contoh data untuk tabel prodi
-- ============================================
INSERT INTO prodi (kode_prodi, nama_prodi, akreditasi) VALUES
('TI001', 'Teknik Informatika', 'A'),
('SI001', 'Sistem Informasi', 'B'),
('TK001', 'Teknik Komputer', 'Baik');

-- Contoh data untuk tabel dosen
INSERT INTO dosen (nidn, nama_dosen, kode_prodi) VALUES
('0001', 'Dr. Budi Santoso', 'TI001'),
('0002', 'Dr. Siti Rahayu', 'SI001'),
('0003', 'Dr. Ahmad Fauzi', 'TK001');

-- Contoh data untuk tabel mahasiswa
INSERT INTO mahasiswa (nim, nama_mahasiswa, kode_prodi, angkatan) VALUES
('2024001', 'Andi Pratama', 'TI001', 2024),
('2024002', 'Rina Wulandari', 'SI001', 2024),
('2024003', 'Dimas Saputra', 'TK001', 2025);
