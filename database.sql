-- ============================================
-- Script untuk membuat database dan 3 tabel
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
    nip VARCHAR(20) NOT NULL PRIMARY KEY,
    nama_dosen VARCHAR(100) NOT NULL,
    angkatan_masuk YEAR NOT NULL,
    agama ENUM('Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu') NOT NULL,
    jenis_kelamin ENUM('Laki-laki', 'Perempuan') NOT NULL
) ENGINE=InnoDB;

-- ============================================
-- Tabel 3: mahasiswa (Mahasiswa)
-- ============================================
CREATE TABLE IF NOT EXISTS mahasiswa (
    nim VARCHAR(20) NOT NULL PRIMARY KEY,
    nama_mahasiswa VARCHAR(100) NOT NULL,
    kelas VARCHAR(10) NOT NULL,
    angkatan YEAR NOT NULL,
    agama ENUM('Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu') NOT NULL
) ENGINE=InnoDB;

-- ============================================
-- Contoh data untuk tabel prodi
-- ============================================
INSERT INTO prodi (kode_prodi, nama_prodi, akreditasi) VALUES
('TI001', 'Teknik Informatika', 'A'),
('SI001', 'Sistem Informasi', 'B'),
('TK001', 'Teknik Komputer', 'Baik');

-- ============================================
-- Contoh data untuk tabel dosen
-- ============================================
INSERT INTO dosen (nip, nama_dosen, angkatan_masuk, agama, jenis_kelamin) VALUES
('198501012010011001', 'Dr. Budi Santoso', 2010, 'Islam', 'Laki-laki'),
('198703152012012002', 'Dr. Siti Rahayu', 2012, 'Islam', 'Perempuan'),
('199001202015011003', 'Dr. Ahmad Fauzi', 2015, 'Kristen', 'Laki-laki');

-- ============================================
-- Contoh data untuk tabel mahasiswa
-- ============================================
INSERT INTO mahasiswa (nim, nama_mahasiswa, kelas, angkatan, agama) VALUES
('2024001', 'Andi Pratama', 'TI-1A', 2024, 'Islam'),
('2024002', 'Rina Wulandari', 'SI-1B', 2024, 'Kristen'),
('2024003', 'Dimas Saputra', 'TK-1A', 2025, 'Hindu');
