package com.heg.vehiclePassManagementSystem.model;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "VEHICLES_MASTER")
public class Vehicle {

    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    private Long id;

    @Column(name = "VEHICLE_NUMBER", unique = true, nullable = false)
    private String vehicleNumber;

    @Column(name = "VEHICLE_TYPE")
    private String vehicleType;

    @Column(name = "OWNER_NAME", nullable = false)
    private String ownerName;

    @Column(name = "IS_BLACKLISTED")
    private boolean isBlacklisted = false;

    @Column(name = "CREATED_AT")
    private LocalDateTime createdAt = LocalDateTime.now();

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getVehicleNumber() { return vehicleNumber; }
    public void setVehicleNumber(String vehicleNumber) { this.vehicleNumber = vehicleNumber; }
    public String getVehicleType() { return vehicleType; }
    public void setVehicleType(String vehicleType) { this.vehicleType = vehicleType; }
    public String getOwnerName() { return ownerName; }
    public void setOwnerName(String ownerName) { this.ownerName = ownerName; }
    public boolean isBlacklisted() { return isBlacklisted; }
    public void setBlacklisted(boolean blacklisted) { this.isBlacklisted = blacklisted; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}