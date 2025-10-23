// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title MaintenanceReportRegistry
 * @dev Smart contract for recording and tracking water pipe maintenance reports on blockchain
 * @notice This contract provides immutable record-keeping for maintenance activities
 */
contract MaintenanceReportRegistry is AccessControl, Pausable {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant TECHNICIAN_ROLE = keccak256("TECHNICIAN_ROLE");

    enum Status {
        Pending,
        Assigned,
        InProgress,
        AwaitingApproval,
        Completed,
        Approved,
        Rejected
    }

    struct Report {
        uint256 id;
        address reporter;
        bytes32 detailsHash; // Hash of report details (location, description, etc.)
        string ipfsHash; // IPFS hash for photos and documents
        Status status;
        address assignedTechnician;
        uint256 createdAt;
        uint256 updatedAt;
        uint256 completedAt;
        bool exists;
    }

    struct StatusChange {
        Status fromStatus;
        Status toStatus;
        address changedBy;
        uint256 timestamp;
        string notes;
    }

    // Mappings
    mapping(uint256 => Report) public reports;
    mapping(uint256 => StatusChange[]) public reportHistory;
    mapping(address => uint256[]) public reporterReports;
    mapping(address => uint256[]) public technicianReports;

    // Counters
    uint256 public totalReports;
    uint256 public completedReports;

    // Events
    event ReportCreated(
        uint256 indexed reportId,
        address indexed reporter,
        bytes32 detailsHash,
        string ipfsHash,
        uint256 timestamp
    );

    event ReportAssigned(
        uint256 indexed reportId,
        address indexed technician,
        uint256 timestamp
    );

    event StatusChanged(
        uint256 indexed reportId,
        Status indexed oldStatus,
        Status indexed newStatus,
        address changedBy,
        uint256 timestamp
    );

    event ReportCompleted(
        uint256 indexed reportId,
        address indexed technician,
        uint256 timestamp
    );

    event ReportApproved(
        uint256 indexed reportId,
        address indexed approver,
        uint256 timestamp
    );

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);
    }

    /**
     * @dev Create a new maintenance report
     * @param reportId Unique identifier for the report (from off-chain database)
     * @param reporter Address of the person reporting the issue
     * @param detailsHash Hash of the report details
     * @param ipfsHash IPFS hash for associated media
     */
    function createReport(
        uint256 reportId,
        address reporter,
        bytes32 detailsHash,
        string memory ipfsHash
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused {
        require(!reports[reportId].exists, "Report already exists");
        require(reporter != address(0), "Invalid reporter address");
        require(detailsHash != bytes32(0), "Invalid details hash");

        reports[reportId] = Report({
            id: reportId,
            reporter: reporter,
            detailsHash: detailsHash,
            ipfsHash: ipfsHash,
            status: Status.Pending,
            assignedTechnician: address(0),
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            completedAt: 0,
            exists: true
        });

        reporterReports[reporter].push(reportId);
        totalReports++;

        emit ReportCreated(reportId, reporter, detailsHash, ipfsHash, block.timestamp);
    }

    /**
     * @dev Assign a technician to a report
     * @param reportId The report ID
     * @param technician Address of the assigned technician
     */
    function assignTechnician(
        uint256 reportId,
        address technician
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused {
        require(reports[reportId].exists, "Report does not exist");
        require(technician != address(0), "Invalid technician address");
        require(
            reports[reportId].status == Status.Pending,
            "Report must be in Pending status"
        );

        Report storage report = reports[reportId];
        Status oldStatus = report.status;
        
        report.assignedTechnician = technician;
        report.status = Status.Assigned;
        report.updatedAt = block.timestamp;

        technicianReports[technician].push(reportId);

        _recordStatusChange(reportId, oldStatus, Status.Assigned, "Technician assigned");

        emit ReportAssigned(reportId, technician, block.timestamp);
        emit StatusChanged(reportId, oldStatus, Status.Assigned, msg.sender, block.timestamp);
    }

    /**
     * @dev Update report status
     * @param reportId The report ID
     * @param newStatus The new status
     * @param notes Optional notes about the status change
     */
    function updateStatus(
        uint256 reportId,
        Status newStatus,
        string memory notes
    ) external whenNotPaused {
        require(reports[reportId].exists, "Report does not exist");
        
        Report storage report = reports[reportId];
        Status oldStatus = report.status;

        // Validate status transitions
        require(_isValidStatusTransition(oldStatus, newStatus), "Invalid status transition");

        // Check permissions
        if (newStatus == Status.InProgress || newStatus == Status.AwaitingApproval) {
            require(
                msg.sender == report.assignedTechnician || hasRole(TECHNICIAN_ROLE, msg.sender),
                "Only assigned technician can update to this status"
            );
        } else if (newStatus == Status.Approved || newStatus == Status.Rejected) {
            require(hasRole(OPERATOR_ROLE, msg.sender), "Only operators can approve/reject");
        }

        report.status = newStatus;
        report.updatedAt = block.timestamp;

        if (newStatus == Status.Completed || newStatus == Status.Approved) {
            report.completedAt = block.timestamp;
            if (newStatus == Status.Approved) {
                completedReports++;
            }
            emit ReportCompleted(reportId, report.assignedTechnician, block.timestamp);
        }

        _recordStatusChange(reportId, oldStatus, newStatus, notes);

        emit StatusChanged(reportId, oldStatus, newStatus, msg.sender, block.timestamp);

        if (newStatus == Status.Approved) {
            emit ReportApproved(reportId, msg.sender, block.timestamp);
        }
    }

    /**
     * @dev Get report details
     * @param reportId The report ID
     */
    function getReport(uint256 reportId) external view returns (Report memory) {
        require(reports[reportId].exists, "Report does not exist");
        return reports[reportId];
    }

    /**
     * @dev Get report history
     * @param reportId The report ID
     */
    function getReportHistory(uint256 reportId) external view returns (StatusChange[] memory) {
        require(reports[reportId].exists, "Report does not exist");
        return reportHistory[reportId];
    }

    /**
     * @dev Get reports by reporter
     * @param reporter The reporter address
     */
    function getReportsByReporter(address reporter) external view returns (uint256[] memory) {
        return reporterReports[reporter];
    }

    /**
     * @dev Get reports by technician
     * @param technician The technician address
     */
    function getReportsByTechnician(address technician) external view returns (uint256[] memory) {
        return technicianReports[technician];
    }

    /**
     * @dev Verify report data integrity
     * @param reportId The report ID
     * @param detailsHash Hash to verify against
     */
    function verifyReportIntegrity(
        uint256 reportId,
        bytes32 detailsHash
    ) external view returns (bool) {
        require(reports[reportId].exists, "Report does not exist");
        return reports[reportId].detailsHash == detailsHash;
    }

    /**
     * @dev Get statistics
     */
    function getStatistics() external view returns (
        uint256 total,
        uint256 completed,
        uint256 pending,
        uint256 inProgress
    ) {
        total = totalReports;
        completed = completedReports;
        
        // Note: For pending and inProgress, you'd need to iterate or maintain counters
        // This is a simplified version
        pending = 0;
        inProgress = 0;
    }

    // Internal functions

    function _recordStatusChange(
        uint256 reportId,
        Status fromStatus,
        Status toStatus,
        string memory notes
    ) internal {
        reportHistory[reportId].push(
            StatusChange({
                fromStatus: fromStatus,
                toStatus: toStatus,
                changedBy: msg.sender,
                timestamp: block.timestamp,
                notes: notes
            })
        );
    }

    function _isValidStatusTransition(Status from, Status to) internal pure returns (bool) {
        if (from == Status.Pending && to == Status.Assigned) return true;
        if (from == Status.Assigned && to == Status.InProgress) return true;
        if (from == Status.InProgress && to == Status.AwaitingApproval) return true;
        if (from == Status.AwaitingApproval && (to == Status.Approved || to == Status.Rejected)) return true;
        if (from == Status.Rejected && to == Status.Assigned) return true; // Re-assign
        return false;
    }

    // Admin functions

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function grantOperatorRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(OPERATOR_ROLE, account);
    }

    function grantTechnicianRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(TECHNICIAN_ROLE, account);
    }
}
